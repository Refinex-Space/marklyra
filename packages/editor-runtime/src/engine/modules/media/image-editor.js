// media/image-editor.
export default function initializeMediaImageEditor(requireModule, moduleExports, moduleRecord) {
  'use strict';

  var uploaderCommands,
    hostGlobal = this || self,
    jquery = requireModule('libraries/jquery'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    userOperations = requireModule('editing/user-operations'),
    inlineDecoration = requireModule('render/inline-decoration'),
    rangy = requireModule('editing/selection').rangy,
    undoManager = requireModule('editing/undo-manager'),
    SnapFlag = undoManager.SnapFlag,
    dialogs = requireModule('ui/dialogs'),
    utilities = requireModule('shared/utilities'),
    fileIntegration = requireModule('host/file-integration'),
    imageScale = requireModule('media/image-scale'),
    assetStorage = requireModule('media/asset-storage'),
    mediaActions = requireModule('media/actions'),
    referenceUpdateStartedAt =
      (requireModule('document/recovery'), requireModule('render/html-blocks'), null),
    pendingReferences = {},
    timerId = null,
    copyImagesPreferenceKey = 'marklyra-copy-images-to';
  function isAbsoluteImagePath(filePath) {
    return /(^[\\\/])|(^[a-zA-Z]:)/.exec(filePath);
  }
  function rememberMovedImageDimensions(text, inputSrc, imageElement) {
    if (imageElement && text && inputSrc) {
      var clientHeight = imageElement.clientHeight,
        clientWidth = imageElement.clientWidth;
      if (clientHeight && clientWidth) {
        imagePreLoadAfterMove['file://' + text.replace(/^file:\/\//, '').replace(/\\/g, '/')] = {
          src: inputSrc,
          size: 'height:' + clientHeight + 'px;width:' + clientWidth + 'px;',
        };
      }
    }
  }
  function replaceMarkdownImageSource(text, imageSource) {
    return text.replace(
      /(]\s*\(<?)((?:\([^)]*\)|[^()])*?)(>?[ \t]*((['"])(.*?)\5[ \t]*)?\))/,
      '$1' + imageSource + '$3',
    );
  }
  function replaceHtmlImageSource(text, imageSource) {
    if (/src\s*=\s*['"]/.exec(text)) {
      return text.replace(/(src\s*=\s*(["'])).+?(\2)/i, '$1' + imageSource + '$3');
    } else {
      return text.replace(/(src\s*=\s*)([^\s'"]+)(\s|$)/i, '$1"' + imageSource + '"$3');
    }
  }
  function clearImageTransferState(element) {
    element.removeClass('md-on-uploading').removeClass('md-on-moving');
    element.find('.md-image-uploading-mask-wrapper').remove();
    element.removeAttr('data-origin-path');
  }
  function finishImageTransfer(originalPath) {
    var imageElements = jquery('[data-origin-path=' + JSON.stringify(originalPath) + ']');
    uploadImageQueue.delete(originalPath);
    moveImageQueue.delete(originalPath);
    if (imageElements.length) {
      clearImageTransferState(imageElements);
    } else {
      console.debug('no image for path ' + originalPath);
    }
    return imageElements;
  }
  function createUniqueImagePath(text) {
    var extension = reqnode('path').extname(text),
      filenameSeparator = '-';
    if (/[\/\\]$/.exec(text)) {
      extension = '';
      filenameSeparator = '';
    }
    return (
      text.replace(/(\.[^.\/\\]+?$)/, '') +
      filenameSeparator +
      utilities.tempString() +
      extension
    ).replace(/^\-/, '');
  }
  async function backupMediaFile(from) {
    var temporaryName = utilities.tempString(),
      userDataPath = File.isWin ? '\\' : '/',
      backupPath =
        File.option.userDataPath + userDataPath + 'runtime-storage' + userDataPath + temporaryName;
    if (!from || !File.option.userDataPath) {
      return '';
    }
    if (File.isNode) {
      return await (async function (sourcePath, destinationPath) {
        var fileSystem = reqnode('fs-extra');
        try {
          await fileSystem.copy(sourcePath, destinationPath);
        } catch (error) {
          console.warn('failed to write temp image data', error);
          return '';
        }
        return destinationPath;
      })(from, backupPath);
    } else {
      if (File.isMac && (await JSBridge.invoke('path.copyFile', { from: from, to: backupPath }))) {
        return backupPath;
      } else {
        return void 0;
      }
    }
  }
  function copyImageToFolder(
    imageElements,
    targetFolder,
    sourcePath,
    filenameDefined,
    ignoreAlert,
  ) {
    var applyUploadingStyle = inlineDecoration.applyUploadingStyle;
    if (imageElements.length) {
      var element = imageElements.find('img')[0];
      loadedImgCache.remove(utilities.wkfile2file(element.getAttribute('src') || ''));
      element.onload = null;
    }
    this.editor.brush.clearAndPause(true);
    window.moveImageQueue.add(sourcePath);
    applyUploadingStyle(imageElements, sourcePath, true, true);
    this.editor.brush.resume();
    return (
      File.isMac
        ? function (folder, inputSrc) {
            inputSrc = inputSrc.replace(/^file:\/\//, '');
            if (!/^\w+:/.exec(inputSrc)) {
              try {
                inputSrc = decodeURI(inputSrc);
              } catch (error) {}
            }
            if ('textbundle' == folder) {
              return new Promise(function (resolvePromise, rejectPromise) {
                bridge.callHandler('images.addToBundle', { src: inputSrc }, function (copyResult) {
                  if (copyResult.filename) {
                    resolvePromise('/textbundle/' + copyResult.filename);
                  } else {
                    resolvePromise(inputSrc);
                  }
                });
              });
            } else {
              return new Promise(function (resolvePromise, rejectPromise) {
                bridge.callHandler(
                  'images.copyImage',
                  {
                    src: inputSrc,
                    folder: folder,
                    fileNameDefined: filenameDefined || false,
                    ignoreAlert: ignoreAlert || false,
                  },
                  function (copyResult) {
                    if (copyResult.success) {
                      resolvePromise(copyResult.msg);
                    } else {
                      rejectPromise(copyResult.msg);
                    }
                  },
                );
              });
            }
          }
        : function (targetFolder, sourcePath) {
            if ('textbundle' === targetFolder) {
              targetFolder = File.editor.imgEdit.getRealTargetImageStorageFolder(targetFolder);
            }
            return new Promise(function (resolvePromise, rejectPromise) {
              var fileSystem = reqnode('fs-extra'),
                destinationPath = null;
              function copyImageResource(text, destinationPath, overwrite) {
                var match;
                if (/^(http(s?))|(ftp):\/\//.exec(text)) {
                  !(function (sourceUrl, destinationPath, onComplete, onError, overwrite) {
                    var pathUtilities = reqnode('path'),
                      directoryPath = pathUtilities.dirname(destinationPath),
                      fileName = pathUtilities.basename(
                        overwrite ? destinationPath : createUniqueImagePath(destinationPath),
                      );
                    JSBridge.invoke('app.download', sourceUrl, directoryPath, fileName).then(
                      ({ path: downloadedPath, state: downloadState, type: currentText }) => {
                        var fileSystem = reqnode('fs'),
                          imageExtension = '';
                        function applyDownloadedExtension() {
                          if (imageExtension) {
                            var currentPathUtilities = reqnode('path'),
                              parsedPath = currentPathUtilities.parse(destinationPath);
                            if ('.jpg' != parsedPath.ext) {
                              destinationPath = currentPathUtilities.join(
                                parsedPath.dir,
                                parsedPath.name + '.' + imageExtension,
                              );
                            }
                          }
                          fileSystem.rename(downloadedPath, destinationPath, (renameError) => {
                            if (renameError) {
                              console.sendError(renameError);
                            } else {
                              downloadedPath = destinationPath;
                            }
                            onComplete(downloadedPath);
                          });
                        }
                        if (currentText && currentText.indexOf('image/') > -1) {
                          imageExtension = currentText.substr('image/'.length);
                        }
                        if ('completed' == downloadState) {
                          if (overwrite) {
                            if (downloadedPath != destinationPath) {
                              applyDownloadedExtension();
                            } else {
                              onComplete(downloadedPath);
                            }
                          } else {
                            fileSystem.access(
                              destinationPath,
                              fileSystem.F_OK,
                              function (accessError) {
                                if (accessError) {
                                  applyDownloadedExtension();
                                } else {
                                  onComplete(downloadedPath);
                                }
                              },
                            );
                          }
                        } else {
                          console.error(downloadState);
                          onError(
                            downloadState
                              ? 'Image download ' + downloadState
                              : 'unknown error for image download',
                          );
                        }
                      },
                    );
                  })(text, destinationPath, resolvePromise, rejectPromise, overwrite);
                } else {
                  if ((match = /^data:image\/[^;]+;base64,/.exec(text))) {
                    var base64Data = decodeURI(text.substr(match[0].length));
                    try {
                      base64Data = decodeURI(base64Data);
                    } catch (error) {}
                    fileSystem.writeFile(
                      destinationPath,
                      base64Data,
                      'base64',
                      function (inputError) {
                        if (inputError) {
                          return rejectPromise('Failed to copy image\n.' + inputError.message);
                        }
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
                        if (message) {
                          return rejectPromise(
                            'Failed to copy image\n.' + (message.message || message),
                          );
                        }
                        resolvePromise(destinationPath);
                      },
                    );
                  }
                }
              }
              function copyToAvailablePath(sourcePath, destinationPath) {
                fileSystem.access(destinationPath, fileSystem.F_OK, function (accessError) {
                  if (!accessError) {
                    destinationPath = createUniqueImagePath(destinationPath);
                  }
                  copyImageResource(sourcePath, destinationPath, false);
                });
              }
              var localText,
                pathSeparator = File.isWin ? '\\' : '/';
              if (filenameDefined) {
                copyImageResource(sourcePath, (destinationPath = targetFolder), true);
              } else {
                if (/^data:/.exec(sourcePath)) {
                  if (!(localText = (/^data:image\/([^;]+);base64,/.exec(sourcePath) || [])[1])) {
                    return resolvePromise(sourcePath);
                  }
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
                } else {
                  localText = fileIntegration.getFileNameFromPath(sourcePath);
                  localText = utilities.removeInvalidPathCh(localText.replace(/\?([^./]*)$/, ''));
                }
                targetFolder = (targetFolder + pathSeparator).replace(/[\/\\]{2}$/, pathSeparator);
                destinationPath = targetFolder + localText;
                if (
                  window.imageDownloadMap[destinationPath] &&
                  window.imageDownloadMap[destinationPath] != sourcePath
                ) {
                  destinationPath = createUniqueImagePath(destinationPath);
                } else {
                  window.imageDownloadMap[destinationPath] = sourcePath;
                }
                if (/^(https?|ftp):/.exec(sourcePath)) {
                  copyToAvailablePath(sourcePath, destinationPath);
                } else {
                  fileSystem.stat(sourcePath, (error, fileInfo) => {
                    if (error) {
                      rejectPromise('Failed to copy image\n.' + (error.message || error));
                    } else {
                      if (fileInfo && fileInfo.isFile()) {
                        copyToAvailablePath(sourcePath, destinationPath);
                      } else {
                        rejectPromise('Failed to copy image\n. Image src is not a file');
                      }
                    }
                  });
                }
              }
            });
          }
    )
      .call(this, targetFolder, sourcePath)
      .then(
        function (result) {
          if (result) {
            mediaActions.recordMediaMoves(result);
            return backupMediaFile(result).then((inputResult) => [result, inputResult]);
          } else {
            return [];
          }
        },
        function () {
          finishImageTransfer(sourcePath);
        },
      );
  }
  function parseUploaderOutput(outputText, uploaderType) {
    if ('picgo-app' == uploaderType || 'piclist-app' == uploaderType) {
      return (function (responseText) {
        try {
          var response = JSON.parse(responseText);
          if (response.success) {
            return response.result;
          } else {
            return [];
          }
        } catch (error) {
          return [];
        }
      })(outputText);
    } else {
      return (function (text) {
        var parts = text.split(/\r?\n/);
        console.sendLog('[Upload Result] ' + text);
        for (var imageUrls = [], itemIndex = parts.length - 1; itemIndex >= 0; itemIndex--) {
          var trimmedText = parts[itemIndex].trim();
          if (trimmedText) {
            if (/^(https?|ftp|file):\//.exec(trimmedText)) {
              imageUrls.unshift(trimmedText);
            } else {
              if (/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}\/.*$/.exec(trimmedText)) {
                imageUrls.unshift('http://' + trimmedText);
              } else {
                if (imageUrls.length) {
                  break;
                }
              }
            }
          }
        }
        return imageUrls;
      })(outputText);
    }
  }
  function uploadImageElements(imageElements, sourcePath) {
    this.editor.brush.pause();
    sourcePath = utilities.absolutePathFrom(sourcePath);
    window.uploadImageQueue.add(sourcePath);
    inlineDecoration.applyUploadingStyle(imageElements, sourcePath, false);
    this.editor.brush.resume();
    return function (file) {
      var receiver = this;
      return new Promise(function (resolvePromise, rejectPromise) {
        if (File.isMac) {
          var uploaderType = receiver.getImageUploader();
          bridge.callHandler(
            'images.upload',
            { command: receiver.getImageUploaderCommand(uploaderType), file: file },
            function (uploadResult) {
              var imageUrls;
              if (uploadResult.success) {
                if ('ipic' == uploaderType) {
                  resolvePromise(uploadResult.msg);
                } else {
                  if (
                    (imageUrls = parseUploaderOutput(uploadResult.msg, uploaderType))[
                      imageUrls.length - 1
                    ]
                  ) {
                    resolvePromise(imageUrls[imageUrls.length - 1]);
                  } else {
                    rejectPromise(uploadResult.msg);
                  }
                }
              } else {
                rejectPromise(uploadResult.msg);
              }
            },
          );
        } else {
          if (File.isNode) {
            runImageUploader
              .call(receiver, [file])
              .then((result) => {
                resolvePromise(result[0]);
              })
              .catch(rejectPromise);
          } else {
            rejectPromise();
          }
        }
      });
    }.call(this, sourcePath);
  }
  function runImageUploader(list) {
    var uploaderCommand = this.getImageUploaderCommand();
    if (!uploaderCommand) {
      return Promise.reject('Upload command not found.');
    }
    var usesAppServer = 'picgo-app' == uploaderCommand || 'piclist-app' == uploaderCommand;
    return (
      usesAppServer
        ? (function (uploaderType) {
            var picgoAppPath = File.option.picgoAppPath,
              piclistAppPath = File.option.piclistAppPath;
            if ('picgo-app' !== uploaderType || picgoAppPath) {
              if ('piclist-app' !== uploaderType || piclistAppPath) {
                return (function postUploadRequest(retried) {
                  return window
                    .fetch('http://127.0.0.1:36677/upload', {
                      method: 'POST',
                      body: JSON.stringify({ list: list }),
                    })
                    .then(
                      function (result) {
                        if (200 === result.status) {
                          return result
                            .json()
                            .then((inputResult) =>
                              inputResult.success
                                ? (console.sendLog(
                                    '[Upload Result] ' + JSON.stringify(inputResult.result),
                                  ),
                                  inputResult.result)
                                : Promise.reject(JSON.stringify(inputResult)),
                            );
                        } else {
                          return Promise.reject(result.text());
                        }
                      },
                      function (result) {
                        if (retried) {
                          return Promise.reject(result.message || 'failed');
                        } else {
                          return new Promise(function (resolvePromise, rejectPromise) {
                            var currentTimerId = setTimeout(() => {
                              currentTimerId = null;
                              postUploadRequest(true).then(resolvePromise, rejectPromise);
                            }, 5e3);
                            window
                              .reqnode('child_process')
                              .exec(
                                JSON.stringify(
                                  'piclist-app' === uploaderType ? piclistAppPath : picgoAppPath,
                                ),
                                (launchError, unusedParameter2, unusedParameter3) => {
                                  if (currentTimerId && launchError) {
                                    rejectPromise(
                                      'failed to launch PicGo app: ' + launchError.message,
                                    );
                                    clearTimeout(currentTimerId);
                                  }
                                },
                              );
                          });
                        }
                      },
                    );
                })(false);
              } else {
                return Promise.reject('请在偏好设置中配置 PicList (app) 的路径。');
              }
            } else {
              return Promise.reject('请在偏好设置中配置 PicGo (app) 的路径。');
            }
          })(uploaderCommand)
        : new Promise((resolvePromise, rejectPromise) => {
            reqnode('child_process').exec(
              uploaderCommand + ' ' + utilities.escapeShell(list),
              { maxBuffer: 2097152 },
              (executionError, stdout, stderr) => {
                if (executionError) {
                  console.warn('exec error: ' + executionError);
                  return void rejectPromise(executionError);
                }
                if (stdout) {
                  resolvePromise(stdout);
                } else {
                  console.warn('error: ' + stderr);
                  rejectPromise(stderr);
                }
              },
            );
          })
    ).then((result) => {
      var imageUrls = usesAppServer ? result : parseUploaderOutput(result, uploaderCommand);
      if (imageUrls.length == list.length) {
        return Promise.resolve(imageUrls);
      } else {
        console.log(result);
        return Promise.reject('fail to parse result image path from: ' + result);
      }
    });
  }
  function replaceImageSources(imageElements, imageSource, deferRegistration) {
    var currentSrc = imageSource;
    imageSource = this.resolveImagePath(imageSource);
    var range,
      selectionSnapshot,
      updateCommand,
      editor = this.editor;
    editor.undo.endSnap(true);
    imageElements.each(function (unusedParameter1, element) {
      if (element) {
        var currentElement = element.querySelector('.md-content');
        if (currentElement) {
          if (!updateCommand) {
            range = editor.selection.getRangy();
            selectionSnapshot = editor.selection.buildUndo(range);
            updateCommand = undoManager.makeEmptyCommand(selectionSnapshot);
          }
          var text = currentElement.textContent,
            currentText =
              element.getAttribute('md-inline') == NodeType.imgtag
                ? replaceHtmlImageSource(text, imageSource)
                : replaceMarkdownImageSource(text, imageSource),
            adjustedSelection = jquery.extend({}, selectionSnapshot),
            start = currentText.length - text.length,
            documentNode = editor.findNodeByElem(jquery(element).closest('[cid]'));
          editor.undo.endSnap(true);
          var localElement = element.querySelector('.md-content');
          if (
            range &&
            localElement &&
            range.comparePoint &&
            range.comparePoint(localElement, 1) < 0
          ) {
            adjustedSelection.start += start;
          }
          if (
            range &&
            localElement &&
            range.comparePoint &&
            range.comparePoint(localElement, 2) < 0
          ) {
            adjustedSelection.end += start;
          }
          updateCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
          currentElement.textContent = currentText;
          editor.store(documentNode, true);
          var nodeElement = editor.findElemById(documentNode.cid);
          editor.brush.brushNode(documentNode.cid);
          nodeElement.removeClass('md-expand');
          editor.undo.exeCommand(adjustedSelection);
          if (
            (range = editor.selection.getRangy()) &&
            jquery(range.commonAncestorContainer).closest('.md-image').length
          ) {
            adjustedSelection = editor.imgEdit.selectComponent('alt', true);
          }
          updateCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
          updateCommand.redo.push(adjustedSelection);
        } else {
          adjustedSelection = this.editor.selection.buildUndo();
        }
      }
    });
    if (updateCommand && !deferRegistration) {
      var previousCommand = editor.undo.lastRegisteredOperationCommand();
      if (previousCommand && previousCommand.src === currentSrc) {
        undoManager.append(previousCommand, updateCommand);
      } else {
        editor.undo.register(updateCommand);
      }
    }
    return updateCommand;
  }
  async function recordMediaMoveHistory(
    updateCommand,
    originalPath,
    from,
    inputFrom,
    deleteOriginal,
  ) {
    if (updateCommand && from && originalPath != from) {
      updateCommand.undo.push({ type: 'deleteMedia', from: from });
      updateCommand.redo.unshift({ type: 'restoreMedia', from: inputFrom, to: from });
      if (deleteOriginal && isAbsoluteImagePath(originalPath)) {
        await File.editor.imgEdit.deleteMedia(originalPath, true, updateCommand, inputFrom);
      }
      if (File.isTextPack()) {
        isAbsoluteImagePath(from);
      }
    }
  }
  function moveImageElements(
    imageElements,
    targetFolder,
    inputSrc,
    filenameDefined,
    silent,
    deleteOriginal,
  ) {
    var receiver = this;
    if (imageElements && imageElements.length && inputSrc) {
      copyImageToFolder
        .call(this, imageElements, targetFolder, inputSrc, filenameDefined, false)
        .then(
          function (result) {
            if (result) {
              var destinationPath = result[0],
                backupPath = result[1];
              if (void 0 !== destinationPath) {
                imageElements = finishImageTransfer(inputSrc);
                if ('textbundle' !== targetFolder) {
                  rememberMovedImageDimensions(
                    destinationPath,
                    inputSrc,
                    imageElements.find('img')[0],
                  );
                }
                var updateCommand = replaceImageSources.call(
                  receiver,
                  imageElements,
                  destinationPath,
                  File.isTextBundle() || File.isTextPack(),
                );
                if (File.isTextBundle() || File.isTextPack()) {
                  var previousCommand = receiver.editor.undo.lastRegisteredOperationCommand();
                  if (previousCommand && previousCommand.src === inputSrc) {
                    undoManager.append(previousCommand, updateCommand);
                  } else {
                    receiver.editor.undo.register(updateCommand);
                  }
                }
                recordMediaMoveHistory(
                  updateCommand,
                  inputSrc,
                  destinationPath,
                  backupPath,
                  deleteOriginal,
                );
              }
            }
          },
          function (result) {
            imageElements = finishImageTransfer(inputSrc);
            if (result) {
              console.error(result);
            }
            if (result && !silent) {
              setTimeout(function () {
                dialogs.showNotification(
                  jquery.localize.getString('Failed to Copy Image to Target Folder.') +
                    ' <code>' +
                    utilities.escape(result) +
                    '</code>',
                  true,
                );
              }, 500);
            }
          },
        );
    }
  }
  window.imgLastModified = Math.floor((new Date() - 0) / 1e3);
  window.uploadImageQueue = new Set();
  window.moveImageQueue = new Set();
  window.imagePreLoadAfterMove = {};
  window.imageDownloadMap = {};
  function isLocalImageSource(sourcePath) {
    return !/^\s*(https?):/.exec(sourcePath);
  }
  var imageMap = {};
  moduleRecord.exports = class {
    constructor(editor) {
      var receiver = this;
      function restoreContextMenuCursor() {
        File.editor.contextMenu.hide();
        File.editor.contextMenu.restoreLastCursor();
      }
      this.removeUploadingStyle = clearImageTransferState;
      this.editor = editor;
      this.uniqueFilePathOnNode = createUniqueImagePath;
      jquery(editor.sessionStr)
        .on('mousemove', '.md-image>.md-meta', function (pointerEvent) {
          fastdom.measure(function () {
            if (
              pointerEvent.offsetX - pointerEvent.target.offsetLeft < 20 &&
              pointerEvent.offsetY < 30
            ) {
              if (
                this.nextElementSibling &&
                this.nextElementSibling.getAttribute('src').trim().length
              ) {
                fastdom.mutate(function () {
                  this.classList.add('md-show-hint');
                }, this);
              }
            } else {
              fastdom.mutate(function () {
                this.classList.remove('md-show-hint');
              }, this);
            }
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
            if (element.attr('md-inline') == NodeType.imgtag) {
              range.selectNodeContents(element.find('.md-meta')[0]);
            } else {
              range.moveToBookmark({
                containerNode: element.children('.md-meta')[0],
                start: 2,
                end: 2 + (pointerEvent.target.getAttribute('alt') || '').length,
              });
            }
            editor.selection.setRange(range, true);
          }
        })
        .on('btn-action', '.md-image-input-src-btn', function (unusedParameter1) {
          jquery('#marklyra-tooltip').hide();
          var range = document.createRange();
          range.setStart(this.parentElement, 0);
          range.setEnd(this.parentElement, 0);
          jquery(this).remove();
          editor.selection.setRange(range, true);
        })
        .on('click btn-action', '.md-image-pick-file-btn', function (unusedParameter1) {
          jquery('#marklyra-tooltip').hide();
          receiver.insertLocalImage();
          return false;
        })
        .on('cursorChange', function (unusedParameter1, styleBookmark) {
          if (
            !(
              (styleBookmark && -1 != styleBookmark.style.inline.indexOf('image')) ||
              !document.querySelector('#user-context-menu.show')
            )
          ) {
            editor.contextMenu.hide('#user-context-menu');
          }
        });
      jquery('.context-menu')
        .on('click', "[data-key='select-img-target'] a", function () {
          restoreContextMenuCursor();
          receiver.copyToSelectedFolderAction();
        })
        .on('click', "[data-key='select-img-target-move'] a", function () {
          restoreContextMenuCursor();
          receiver.copyToSelectedFolderAction(true);
        })
        .on('click', "[data-key='delete-img'] a", function () {
          restoreContextMenuCursor();
          receiver.deleteImageAction(false);
        })
        .on('click', "[data-key='delete-img-file'] a", function () {
          restoreContextMenuCursor();
          receiver.deleteImageAction(true);
        })
        .on('click', "[data-key='upload-img'] a", function () {
          restoreContextMenuCursor();
          receiver.uploadAction();
        })
        .on('click', "[data-key='copy-img-to-target'] a", function () {
          restoreContextMenuCursor();
          receiver.copyToTargetFolderAction();
        })
        .on('click', "[data-key='move-img-to-target'] a", function () {
          restoreContextMenuCursor();
          receiver.copyToTargetFolderAction(true);
        })
        .on('click', "[data-key='copy-img'] a", function () {
          restoreContextMenuCursor();
          receiver.copyImage();
        })
        .on('click', "[data-key='reveal-img-in-finder'] a", function () {
          restoreContextMenuCursor();
          receiver.revealInFinder();
        })
        .on('click', "[data-key='reveal-img-in-browser'] a", function () {
          restoreContextMenuCursor();
          receiver.revealInFinder();
        })
        .on('click', "[data-key='zoom-smart'] a", function () {
          restoreContextMenuCursor();
          var imageElements = jquery('.md-expand.md-img-loaded');
          if (imageElements) {
            receiver.zoomAction(imageElements, this.getAttribute('data-variable'));
          }
        })
        .on('click', "[data-key='zoom-img'] a", function () {
          jquery(this.parentElement).trigger('mouseenter');
        });
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
        );
        bridge.registerHandler('images.allImageUploadCallback', function (uploadResult, respond) {
          receiver.allImageUploadCallbackForMac(
            uploadResult.command,
            uploadResult.success,
            uploadResult.message,
            uploadResult.updateMap,
            uploadResult.sources,
          );
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler(
          'images.tagetImageStorageFolderExcludeSetting',
          function (unusedParameter1, respond) {
            if (respond) {
              respond(receiver.getTargetImageStorageFolder(true));
            }
          },
        );
        bridge.registerHandler('images.doSetImageCopyToFolder', function (folderPath, respond) {
          receiver.doSetImageCopyToFolder(folderPath);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('images.doSetImageCopyToIPic', function (unusedParameter1, respond) {
          receiver.doSetImageCopyToFolder('upload', true);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler(
          'images.doRemoveImageCopyToFolder',
          function (unusedParameter1, respond) {
            receiver.doRemoveImageCopyToFolder();
            if (respond) {
              respond();
            }
          },
        );
        bridge.registerHandler('images.doSetImageRootPath', function (rootPath, respond) {
          receiver.doSetImageRootPath(rootPath);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler(
          'images.prepareUploadAllImagesOnMac',
          function (unusedParameter1, respond) {
            receiver.prepareUploadAllImagesOnMac(respond);
          },
        );
        bridge.registerHandler('images.insertImage', function (imageUrl, respond) {
          var insertResult = mediaActions.insertURL(imageUrl);
          if (respond) {
            respond(insertResult);
          }
        });
        bridge.registerHandler('images.zoomImage', function (zoomValue, respond) {
          var zoomResult = receiver.zoomAction(null, zoomValue);
          if (respond) {
            respond(zoomResult);
          }
        });
        bridge.registerHandler('images.switchSyntax', function (pattern, unusedParameter2) {
          receiver.switchPattern(null, pattern);
        });
        bridge.registerHandler(
          'images.updateLocalRootUrl',
          function (unusedParameter1, unusedParameter2) {
            receiver.updateLocalRootUrl(true);
          },
        );
        bridge.registerHandler(
          'images.copyAllImages',
          function ([targetFolder, deleteOriginal], respond) {
            receiver._copyAllImages(targetFolder, deleteOriginal);
            if (respond) {
              respond();
            }
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
      if (element) {
        if (element.dataset.isDataSrc && element.querySelector('img')) {
          return element.querySelector('img').getAttribute('src');
        } else {
          if (absoluteSource) {
            return this.getAbsolutePath(element.dataset.src);
          } else {
            return element.dataset.src;
          }
        }
      } else {
        return '';
      }
    }
    getAbsolutePath(sourcePath, asFileUrl) {
      if (!sourcePath) {
        return sourcePath;
      }
      var absolutePath = utilities.absolutePathFrom(this.getRealSrc(sourcePath));
      if (asFileUrl) {
        if (!/^[a-z]+:/i.exec(absolutePath)) {
          return 'file://' + absolutePath;
        }
      } else {
        if (
          !/^https?:/.exec(absolutePath) ||
          /^data?:/.exec(absolutePath) ||
          /^file?:/.exec(absolutePath)
        ) {
          absolutePath = utilities.decodeFromEscapedURL(absolutePath);
        }
      }
      return absolutePath;
    }
    getRealSrc(text, fileUrlsOnly, keepFragment, restoreDeletedAsset) {
      if (!text) {
        return text;
      }
      var fragment = (/#[^.\/\\]+$/.exec(text) || [])[0] || '';
      if (/^data:/.exec(text)) {
        return text;
      }
      if (/^\/\//.exec(text)) {
        return 'http:' + text;
      }
      if (/^https?:\/\//.exec(text)) {
        return text;
      }
      function encodeResolvedImagePath(sourcePath) {
        sourcePath = (sourcePath = encodeURI(sourcePath).replace(/%5C/g, '\\'))
          .replace(/#[^.\/\\]+$/, '')
          .replace(/#/g, '%23');
        if (keepFragment) {
          sourcePath += fragment;
        }
        return sourcePath;
      }
      function restoreManagedImagePath(inputText) {
        if (!restoreDeletedAsset || !assetStorage.shouldManageResource(inputText)) {
          return inputText;
        }
        var filePath = File.isWin ? '\\' : '/',
          assetsPrefix = File.bundle.filePath + filePath + 'assets' + filePath,
          assetName = utilities.trimPathParam(inputText.substring(assetsPrefix.length)),
          deletedAssets = assetStorage.deletedAssetsMap();
        if (deletedAssets[assetName]) {
          reqnode('fs-extra').copy(
            deletedAssets[assetName],
            inputText,
            { errorOnExist: false },
            () => {
              var backupPath = deletedAssets[assetName];
              delete deletedAssets[assetName];
              document
                .querySelectorAll(`[src^="file://${encodeResolvedImagePath(backupPath)}"]`)
                .forEach((item) => {
                  item.src = encodeResolvedImagePath(inputText);
                });
            },
          );
          return deletedAssets[assetName];
        } else {
          (File.bundle.unusedAssets || []).remove(assetName);
          return inputText;
        }
      }
      text = utilities.decodeFromEscapedPath(text);
      try {
        if (/^(file|ftp|https?):(\/\/|\\\\)/gi.exec(text)) {
          return text;
        }
        if (File.isTextBundle() || File.isTextPack()) {
          if (!/^assets[\/\\]/.exec(text)) {
            return '';
          }
          if (File.isMac) {
            return `textbundle://${encodeResolvedImagePath(text)}`;
          }
        }
        if (fileUrlsOnly) {
          return encodeResolvedImagePath(
            (function (sourcePath) {
              if (/^(wk)?file:/.exec(sourcePath)) {
                return 'file://' + restoreManagedImagePath(utilities.absolutePathFrom(sourcePath));
              }
            })(text),
          );
        }
        var absolutePathPattern = /^((\/)|(\/\/)|(\\\\)|([a-z]+\:[\\\/]))/i,
          localRootUrl = this.editor.docMenu.getLocalRootUrl();
        if (File.isNode) {
          var pathUtilities = reqnode('path');
          if (
            (!localRootUrl || File.isTextBundle() || File.isTextPack()) &&
            absolutePathPattern.exec(text)
          ) {
            return encodeResolvedImagePath(
              'file://' + restoreManagedImagePath(text).replace(/^[\/\\]+/, '/'),
            );
          } else {
            return encodeResolvedImagePath(
              'file://' +
                restoreManagedImagePath(
                  pathUtilities.resolve(
                    localRootUrl || fileIntegration.getCurrentFileFolderPath() || '',
                    text.replace(/^\s*(\\\\|\/)/, ''),
                  ),
                ),
            );
          }
        }
        if (!localRootUrl && absolutePathPattern.exec(text)) {
          return encodeResolvedImagePath(
            (function (sourcePath) {
              if (/[a-z]+:/.exec(sourcePath)) {
                return sourcePath;
              } else {
                return 'file://' + fileIntegration.normalizePath(sourcePath);
              }
            })(restoreManagedImagePath(text || '')),
          );
        } else {
          return encodeResolvedImagePath(
            restoreManagedImagePath(
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
        }
      } catch (error) {}
      return text;
    }
    updateImgRef(referenceName) {
      var inline = this.editor.brush.inline;
      jquery("[data-ref='" + utilities.escapeSelector(referenceName) + "']").each(function () {
        var text = (this.querySelector('.md-content') || {}).textContent;
        if (void 0 !== text) {
          jquery(this).replaceWith(inline.output(text));
        }
      });
    }
    willUpdateImgRef(referenceName) {
      if (referenceName) {
        if (timerId) {
          clearTimeout(timerId);
        }
        pendingReferences[referenceName] = true;
        referenceUpdateStartedAt = referenceUpdateStartedAt || new Date();
        if (new Date() - referenceUpdateStartedAt > 200) {
          setTimeout(
            function () {
              Object.keys(pendingReferences).map(this.updateImgRef, this);
            }.bind(this),
            10,
          );
        } else {
          timerId = setTimeout(
            function () {
              Object.keys(pendingReferences).map(this.updateImgRef, this);
            }.bind(this),
            300,
          );
        }
      }
    }
    startBusyImageLoader() {
      if (window.IntersectionObserver) {
        var items = [];
        this.intersectionObserver = new IntersectionObserver(function (inputItems) {
          items = [];
          inputItems.forEach((item) => {
            if (item.intersectionRatio <= 0) {
              (function (element) {
                let {
                  naturalHeight: naturalHeight,
                  naturalWidth: naturalWidth,
                  height: renderedHeight,
                } = element;
                if (!element.dataset.realSrc) {
                  var currentItems = null;
                  if (naturalHeight * naturalWidth > 5e5 && renderedHeight > 0) {
                    let placeholderSvg = `data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${naturalWidth} ${naturalHeight}"%3E%3C/svg%3E`;
                    currentItems = [element, element.src, placeholderSvg];
                    if (
                      hasExplicitDimension(element.style.height) ||
                      hasExplicitDimension(element.getAttribute('height')) ||
                      hasExplicitDimension(element.style.width) ||
                      hasExplicitDimension(element.getAttribute('width'))
                    ) {
                      element.dataset.fixedSize = true;
                      currentItems.push(0);
                    } else {
                      currentItems.push(renderedHeight);
                    }
                    items.push(currentItems);
                  }
                }
                function hasExplicitDimension(dimensionValue) {
                  return dimensionValue && 'auto' != dimensionValue;
                }
              })(item.target);
            } else {
              (function (element) {
                if (element.dataset.realSrc) {
                  var currentElement,
                    zoom = '';
                  if (element.style.zoom) {
                    zoom = element.style.zoom;
                    (currentElement = element.closest('.md-image')).height =
                      `${currentElement.clientHeight}px`;
                    element.style.zoom = '';
                  }
                  element.src = element.dataset.realSrc;
                  element.dataset.realSrc = '';
                  if (!element.dataset.fixedSize) {
                    element.removeAttribute('height');
                  }
                  element.dataset.fixedSize = '';
                  if (currentElement) {
                    requestAnimationFrame(function () {
                      currentElement.height = '';
                      element.style.zoom = zoom;
                    });
                  }
                }
              })(item.target);
            }
          });
          items.forEach((item) => {
            item[0].dataset.realSrc = item[1];
            item[0].src = item[2];
            if (item[3]) {
              item[0].setAttribute('height', item[3]);
            }
          });
          items = [];
        });
      }
    }
    tryAddImageToBusyLoader(imageElement) {
      if (!File.isMac) {
        return;
      }
      if (imageElement.dataset.realSrc) {
        return;
      }
      const {
        src: imageSource,
        naturalHeight: naturalHeight,
        naturalWidth: naturalWidth,
      } = imageElement;
      if (!this.intersectionObserver) {
        this.startBusyImageLoader();
      }
      if (this.intersectionObserver) {
        if (/^file:/.exec(imageSource) && naturalHeight * naturalWidth > 2e5) {
          this.intersectionObserver.observe(imageElement);
        } else {
          this.intersectionObserver.unobserve(imageElement);
        }
      }
    }
    async deleteMedia(from, useTrash, deleteCommand, backupPath) {
      var currentFrom = backupPath || (await backupMediaFile(from));
      if (!deleteCommand || currentFrom) {
        mediaActions.recordMediaMoves(null, [currentFrom, from]);
        if (deleteCommand) {
          deleteCommand.redo.push({ type: 'deleteMedia', from: from });
          deleteCommand.undo.unshift({ type: 'restoreMedia', from: currentFrom, to: from });
        }
        try {
          if (useTrash && (await JSBridge.invoke('shell.trashItem', from))) {
            return;
          }
          if (File.isNode) {
            await reqnode('node:fs/promises').unlink(from);
          }
          if (File.isMac) {
            await JSBridge.invoke('path.delete', from);
          }
        } catch (error) {
          console.warn(error);
        }
      } else {
        console.error('Failed to prepare undo / redo for image move / delete');
      }
    }
    restoreMedia(from, destinationPath) {
      if (from) {
        try {
          mediaActions.recordMediaMoves(destinationPath);
          var receiver = this;
          if (File.isNode) {
            reqnode('fs-extra').copySync(from, destinationPath);
          } else {
            JSBridge.invoke('path.copyFile', { from: from, to: destinationPath }).then(
              function (result) {
                if (result) {
                  var searchValue = receiver.getRealSrc(from, true, false);
                  jquery('.md-image.md-img-error img').each(function () {
                    if (0 == this.src.indexOf(searchValue)) {
                      receiver.refreshLocalImgDom(this);
                    }
                  });
                }
              },
            );
          }
        } catch (error) {}
      }
    }
    refreshLocalImgDom(domNode, cacheTimestamp, refreshErrorsOnly) {
      var removeTemporaryDimensions = function (loadEvent) {
        loadEvent.target.removeAttribute('width');
        loadEvent.target.removeAttribute('height');
        loadEvent.target.removeEventListener('load', removeTemporaryDimensions);
        loadEvent.target.removeEventListener('error', removeTemporaryDimensions);
      };
      cacheTimestamp = cacheTimestamp || Math.floor((new Date() - 0) / 1e3);
      var originalSource = (domNode.parentElement || domNode).dataset.src || domNode.dataset.src;
      if (!refreshErrorsOnly || domNode.parentElement.classList.contains('md-img-error')) {
        var attributeValue = this.getRealSrc(originalSource);
        if (attributeValue && /^file:/.exec(attributeValue)) {
          failImgCache.remove(attributeValue);
          if (utilities.fromExternalPath(attributeValue)) {
            attributeValue = utilities.file2wkfile(attributeValue);
            failImgCache.remove(attributeValue);
          }
          if ('SOURCE' === domNode.tagName) {
            this.editor.htmlBlock.resetVideoDom(domNode.parentElement);
            domNode.setAttribute('src', attributeValue);
            var parentElement = domNode.parentElement.parentElement;
            if (parentElement) {
              var previousSibling = domNode.parentElement.previousSibling,
                outerHTML = domNode.parentElement.outerHTML;
              domNode.parentElement.remove();
              setTimeout(() => {
                if (previousSibling) {
                  previousSibling.insertAdjacentHTML('afterend', outerHTML);
                } else {
                  parentElement.insertAdjacentHTML('afterbegin', outerHTML);
                }
              }, 0);
            }
            return;
          }
          if (
            !domNode.width &&
            !domNode.height &&
            ('VIDEO' === domNode.tagName ? domNode.readyState > 2 : domNode.complete) &&
            domNode.clientWidth
          ) {
            domNode.width = domNode.clientWidth;
            domNode.height = domNode.clientHeight;
            domNode.addEventListener('load', removeTemporaryDimensions);
            domNode.addEventListener('error', removeTemporaryDimensions);
          }
          domNode.setAttribute('src', attributeValue + '?lastModify=' + cacheTimestamp);
          if ('IMG' === domNode.tagName && domNode.parentElement.dataset.src) {
            domNode.dataset.localRefresh = true;
            domNode.onload = onImageLoadedFunc;
            domNode.onerror = onImageErrorFunc;
          }
          if ('VIDEO' === domNode.tagName) {
            this.editor.htmlBlock.resetVideoDom(domNode);
          }
        }
      }
    }
    refreshLocalImg(forceRefresh) {
      if (forceRefresh || !File.inBusyMode) {
        if (forceRefresh) {
          window.failImgCache = [];
          window.loadedImgCache = [];
        }
        var cacheTimestamp = Math.floor((new Date() - 0) / 1e3),
          receiver = this,
          imageElements = jquery('.md-image img'),
          totalPixels = 0,
          refreshErrorsOnly = false;
        if (!forceRefresh) {
          const pixelThreshold = 1e7;
          imageElements.each(function () {
            if (!(totalPixels > pixelThreshold)) {
              totalPixels += (this.naturalHeight || 0) * (this.naturalWidth || 0);
            }
          });
          refreshErrorsOnly = totalPixels > pixelThreshold;
        }
        imageElements.each(function () {
          receiver.refreshLocalImgDom(this, cacheTimestamp, refreshErrorsOnly);
        });
        imgLastModified = cacheTimestamp;
        if (!refreshErrorsOnly) {
          jquery(
            '.md-htmlblock-container video, .md-htmlblock-container img, .md-htmlblock-container source',
          ).each(function () {
            receiver.refreshLocalImgDom(this, cacheTimestamp, refreshErrorsOnly);
          });
        }
      }
    }
    async reloadAllByNode() {
      await JSBridge.invoke('webContents.clearCache');
      this.refreshLocalImg(true);
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
            if (domNode.dataset.originPath) {
              element.dataset.originPath = domNode.dataset.originPath;
            }
            if (domNode.classList.contains('md-on-moving')) {
              element.classList.add('md-on-moving');
            }
            if (domNode.classList.contains('md-on-uploading')) {
              element.classList.add('md-on-uploading');
            }
            domNode.parentElement.replaceChild(element, domNode);
          }
        }
        var currentElements = document.querySelectorAll('[data-marklyra-watch-src]');
        for (itemIndex = 0; itemIndex < currentElements.length; itemIndex++) {
          var domNode,
            currentSrc = (domNode = currentElements[itemIndex]).dataset.src;
          if (domNode.getAttribute('src') != currentSrc) {
            domNode.src = this.getAbsolutePath(currentSrc, true);
            if ('VIDEO' == domNode.tagName) {
              this.editor.htmlBlock.resetVideoDom(domNode);
            }
          }
        }
      }
    }
    selectComponent(component, deferRegistration) {
      this.editor.undo.endSnap(true);
      var range = this.editor.selection.getRangy(),
        element = jquery(range.startContainer).closest("[md-inline='image']"),
        imageSyntax = element.text(),
        selectionBookmark = range.getBookmark(element[0]),
        end = imageSyntax.indexOf(']'),
        selectCommand = undoManager.makeEmptyCommand(this.editor.selection.buildUndo());
      if (!selectionBookmark.containerNode) {
        return this.editor.selection.buildUndo();
      }
      if ('alt' === component) {
        selectionBookmark.start = 2;
        selectionBookmark.end = end;
      } else {
        if (component) {
          selectionBookmark.start = end + 2;
          selectionBookmark.end = imageSyntax.length - 1;
        } else {
          selectionBookmark.start = 2;
          selectionBookmark.end = end;
        }
      }
      range.moveToBookmark(selectionBookmark);
      this.editor.selection.setRange(range, true);
      var selectionSnapshot = this.editor.selection.buildUndo();
      selectCommand.redo.push(selectionSnapshot);
      if (!deferRegistration) {
        this.editor.undo.register(selectCommand);
      }
      return selectionSnapshot;
    }
    prepareUploadAllImagesOnMac(respond) {
      var receiver = this;
      this.validateBeforeUpload().then((result) => {
        if (result) {
          var uploaderType = receiver.getImageUploader(),
            text = receiver.getImageUploaderCommand(uploaderType);
          if (text) {
            if ('upic' == uploaderType) {
              text.replace('-u', '-s -u');
            }
            var sourcePaths = receiver.buildImageMap();
            respond([true, sourcePaths, text]);
            if (!sourcePaths.length) {
              dialogs.showNotification(
                jquery.localize.getString('No local images found.', 'Panel'),
                void 0,
                void 0,
                void 0,
                true,
              );
            }
          } else {
            respond([true, [], '']);
          }
        } else {
          respond([false, [], '']);
        }
      });
    }
    buildImageMap(includeImage, existenceOnly) {
      imageMap = {};
      includeImage = includeImage || isLocalImageSource;
      for (
        var currentImageElement,
          absolutePath,
          imageElement = document.querySelectorAll('.md-image.md-img-loaded'),
          imageElementLength = imageElement.length,
          itemIndex = 0;
        itemIndex < imageElementLength;
        itemIndex++
      ) {
        currentImageElement = imageElement[itemIndex];
        absolutePath = this.getRealSrc(currentImageElement.dataset.src);
        if (
          includeImage(
            (absolutePath = (absolutePath = utilities.absolutePathFrom(absolutePath)).replace(
              /^file:\/\//,
              '',
            )),
          )
        ) {
          if (existenceOnly) {
            return true;
          }
          imageMap[absolutePath] = imageMap[absolutePath] || [];
          imageMap[absolutePath].push(currentImageElement);
        }
      }
      return !existenceOnly && Object.keys(imageMap);
    }
    allImageUploadCallbackForMac(uploaderType, success, message, replacementMap, items) {
      if ('ipic' == uploaderType) {
        this.replaceImageMap(replacementMap, success, message, uploaderType);
      } else {
        if (!success) {
          return void this.showError(message, 'Failed to upload images:');
        }
        var uploadedUrls = parseUploaderOutput(message, uploaderType);
        if (uploadedUrls.length == items.length) {
          replacementMap = {};
          items.forEach((item, itemIndex) => {
            replacementMap[item] = uploadedUrls[itemIndex];
          });
          this.replaceImageMap(replacementMap, true, message, uploaderType);
        } else {
          this.showError(message, 'Failed to fetch {0} images from: '.replace('{0}', items.length));
        }
      }
    }
    replaceImageMap(replacementMap, success, message, uploaderType) {
      var replaceCommand = undoManager.makeEmptyCommand(this.editor.selection.buildUndo()),
        editor = this.editor,
        set = new Set(),
        failedCount = 0,
        processedCount = 0;
      editor.undo.endSnap(true);
      Object.keys(replacementMap).forEach(function (item) {
        if (imageMap[item]) {
          processedCount++;
          var currentSrc = replacementMap[item];
          if (currentSrc != item) {
            imageMap[item].forEach(function (element) {
              element.querySelector('img').src = currentSrc;
              if (utilities.fromExternalPath(currentSrc)) {
                element.querySelector('img').src = utilities.file2wkfile(currentSrc);
              }
              if (element.hasAttribute('data-src')) {
                element.setAttribute('data-src', currentSrc);
              }
              var currentText,
                text,
                imageNode = editor.findNodeByElem(jquery(element).closest('[cid]')),
                attributeValue = element.getAttribute('md-inline');
              if (
                !set.has(imageNode) &&
                DocumentNode.isType(attributeValue, NodeType.image, NodeType.imgtag)
              ) {
                set.add(imageNode);
                replaceCommand.undo.push(undoManager.buildReplaceUndo(imageNode));
              }
              currentText = element.querySelector('.md-content').textContent;
              if (attributeValue == NodeType.image) {
                text = replaceMarkdownImageSource(currentText, currentSrc);
                element.querySelector('.md-content').textContent = text;
              } else {
                if (attributeValue == NodeType.imgtag) {
                  text = replaceHtmlImageSource(currentText, currentSrc);
                  element.querySelector('.md-content').textContent = text;
                } else {
                  if (attributeValue == NodeType.refimg) {
                    var match =
                        /^!\[((?:\[[^\]]*\]|[^\[\]]|\](?=[^\[]*\]))*)\]\s*\[([^\]]*)\]/.exec(
                          currentText,
                        ),
                      referenceName = (match[2] || match[1]).replace(/\s+/g, ' '),
                      documentNode = editor.nodeMap.link_list.getNodeByRef(referenceName);
                    if (set.has(documentNode)) {
                      return;
                    }
                    set.add(documentNode);
                    replaceCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
                    documentNode.set('href', currentSrc);
                    editor.findElemById(documentNode.cid).replaceWith(documentNode.toHTML());
                  }
                }
              }
            });
          } else {
            failedCount++;
          }
        }
      });
      set.forEach(function (documentNode) {
        if (documentNode.get('type') !== NodeType.def_link) {
          editor.store(documentNode, true);
        }
        replaceCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
      });
      replaceCommand.redo.push(editor.selection.buildUndo());
      editor.undo.register(replaceCommand);
      var keysLength = Object.keys(imageMap).length;
      imageMap = {};
      if (success) {
        dialogs.showNotification(
          jquery.localize.getString('Successfully uploaded {0} images.').format(processedCount),
          false,
          jquery.localize.getString('Undo'),
          function () {
            editor.undo.undo();
          },
        );
      } else {
        if (processedCount) {
          if ('upic' == uploaderType) {
            processedCount -= failedCount;
          }
          dialogs.showNotification(
            jquery.localize
              .getString('Successfully uploaded {0} images, {1} failed.')
              .format(processedCount, keysLength - processedCount) +
              ' ' +
              utilities.truncate(message, 600),
            false,
            jquery.localize.getString('Undo'),
            function () {
              editor.undo.undo();
            },
          );
        } else {
          this.showError(message, 'Failed to upload images:');
        }
      }
    }
    insertLocalImage() {
      function insertSelectedImagePaths(sourcePaths) {
        if (sourcePaths && 0 != sourcePaths.length) {
          mediaActions.insertURLs(sourcePaths);
        }
      }
      if (!File.isLocked) {
        if (File.isNode) {
          JSBridge.invoke('dialog.showOpenDialog', {
            filters: [
              {
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'jfif', 'bmp', 'svg', 'tiff', 'webp', 'gif'],
              },
            ],
            properties: ['openFile', 'multiSelections'],
            buttonLabel: 'Select',
          }).then(({ filePaths: filePaths }) => {
            insertSelectedImagePaths(filePaths);
          });
        } else {
          if (File.isMac) {
            window.bridge.callHandler('images.insertLocalImage', insertSelectedImagePaths);
          }
        }
      }
    }
    shouldTriggerMove(text, searchValue) {
      if (void 0 === searchValue) {
        searchValue = this.getTargetImageStorageFolder(false, true);
      }
      return (
        !(
          'upload' == searchValue &&
          'upload' != this.getTargetImageStorageFolderFromSetting() &&
          !this.checkAutoUploadIsAllowed(true, true)
        ) &&
        !!text &&
        (/^\s*(https?|ftp):\/\//.exec(text)
          ? File.isTextBundle() || File.isTextPack() || File.option.applyImageMoveForWeb
          : !(
              !(File.isTextBundle() || File.isTextPack() || File.option.applyImageMoveForLocal) ||
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
          items.forEach((item) => {
            const sourceKey = getSource(item),
              currentItems = groupedImages[sourceKey];
            if (currentItems) {
              currentItems.push(item);
            } else {
              groupedImages[sourceKey] = [item];
            }
          });
          return groupedImages;
        })(imageElements, (imageElement) => this.getSrcFromDom(imageElement, true));
        for (var sourcePath in imagesBySource) {
          if (this.shouldTriggerMove(sourcePath, targetFolder)) {
            var sourceImages = jquery(imagesBySource[sourcePath]);
            if ('ipic' == targetFolder || 'upload' == targetFolder) {
              this.uploadAction(sourceImages, true);
            } else {
              moveImageElements.call(this, sourceImages, targetFolder, sourcePath, void 0, silent);
            }
          }
        }
      }
    }
    prepImageMove(folder, skipPreparation, imageElements, skipConfirmation) {
      var receiver = this,
        lastCursor = File.editor.selection.buildUndo();
      if (lastCursor) {
        File.editor.lastCursor = lastCursor;
      }
      return new Promise(async function (resolvePromise, rejectPromise) {
        if (skipPreparation) {
          return resolvePromise();
        }
        function rejectImageInsertion(message) {
          if (message) {
            alert(message.message || message);
          }
          rejectPromise();
        }
        if (void 0 === folder) {
          folder = receiver.getTargetImageStorageFolder();
        }
        if ('upload' == folder) {
          return resolvePromise();
        }
        if (!folder) {
          return resolvePromise();
        }
        if (File.isMac) {
          if ('textbundle' == folder && File.isTextBundle()) {
            resolvePromise();
          } else {
            bridge.callHandler(
              'images.prepImageMove',
              {
                folder: folder,
                silent: folder == receiver.getTargetImageStorageFolderFromSetting(),
              },
              function (preparationResult) {
                if ('success' != preparationResult) {
                  rejectImageInsertion(preparationResult);
                } else {
                  resolvePromise();
                }
              },
            );
          }
        } else {
          var fileSystem = reqnode('fs-extra'),
            confirmFolderCreation = false;
          if ('textbundle' === folder) {
            await File.TextBundle.convertToTextBundleIfNeeded();
          }
          if (receiver.getRealTargetImageStorageFolder(folder)) {
            confirmFolderCreation = !(File.isTextBundle() || File.isTextPack());
          }
          if (skipConfirmation) {
            confirmFolderCreation = false;
          }
          if (
            confirmFolderCreation &&
            imageElements &&
            !Array.from(imageElements)
              .map((item) => receiver.getSrcFromDom(item, true))
              .find((item) => receiver.shouldTriggerMove(item, folder))
          ) {
            return void rejectPromise();
          }
          (function (folderPath, requireConfirmation) {
            var fileSystem = reqnode('fs-extra');
            return new Promise(function (inputResolvePromise, inputRejectPromise) {
              if (!requireConfirmation) {
                return inputResolvePromise();
              }
              fileSystem.stat(folderPath, function (error) {
                if (!error) {
                  return inputResolvePromise();
                }
                if ('ENOENT' != error.code) {
                  return inputRejectPromise(error.message);
                }
                var confirmationDialog = jquery('#image-create-folder-confirm')
                  .find('#image-create-folder-target')
                  .text(folderPath)
                  .end()
                  .modal({ backdrop: 'static', keyboard: false });
                File.isLocked = true;
                confirmationDialog
                  .off(
                    'mousedown',
                    '.image-create-folder-dialog-yes, .image-create-folder-dialog-no, .image-create-folder-dialog-help, .close',
                  )
                  .one('mousedown', '.image-create-folder-dialog-yes', function () {
                    confirmationDialog.modal('hide');
                    File.isLocked = false;
                    File.freshMenu();
                    inputResolvePromise();
                  })
                  .one('mousedown', '.image-create-folder-dialog-no', function () {
                    confirmationDialog.modal('hide');
                    File.isLocked = false;
                    File.freshMenu();
                    inputRejectPromise(false);
                  })
                  .one('mousedown', '.close', function () {
                    confirmationDialog.modal('hide');
                    File.isLocked = false;
                    File.freshMenu();
                    inputRejectPromise(false);
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
              File.editor.restoreLastCursor();
              if (directoryError) {
                rejectImageInsertion(directoryError);
              } else {
                resolvePromise();
              }
            });
          }, rejectImageInsertion);
        }
      });
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
          if (parentElement && 'image' == parentElement.getAttribute('md-inline')) {
            imageElements = [range.commonAncestorContainer.parentElement];
          }
        }
        if (imageElements.length) {
          this.prepImageMove(targetFolder, void 0, imageElements).then(
            function () {
              editor.imgEdit.tryMoveImageDoms(imageElements, targetFolder, silent);
            },
            () => {},
          );
        }
        this.editor.brush.resume();
      }
    }
    generateAlt(sourcePath) {
      return (fileIntegration.getFileNameFromPath(sourcePath, true) || '').replace(
        /(^\.)|(\.[^.]+$)/g,
        '',
      );
    }
    insertImageFromURL(sourcePath) {
      var localSrc = sourcePath;
      function generateImageAltText() {
        return File.editor.imgEdit.generateAlt(sourcePath);
      }
      function getImageLeadingSpace() {
        var selection = window.getSelection(),
          leadingSpace = '';
        if (!File.editor.sourceView.inSourceMode && selection.startOffset > 0) {
          leadingSpace = ' ';
        }
        return leadingSpace;
      }
      function insertInlineImage(inputSrc, isUpload) {
        var editor = this.editor,
          element = editor.getMarkElem();
        if (!element.length || !editor.stylize.canContainInline(element)) {
          return false;
        }
        var currentElement,
          isBundleImage = File.isTextBundle() || File.isTextPack() || 'textbundle' == inputSrc,
          altText = generateImageAltText(),
          leadingSpace = getImageLeadingSpace(),
          documentNode = editor.getNode(element.attr('cid')),
          resolvedSource = isBundleImage ? inputSrc : this.resolveImagePath(inputSrc),
          imageMarkdown = leadingSpace + '![' + altText + '](' + resolvedSource + ')',
          range = editor.selection.getRangy();
        if (!range) {
          return null;
        }
        if ((currentElement = jquery(range.startContainer).closest("[md-inline='image']")).length) {
          (isUpload ? window.uploadImageQueue : window.moveImageQueue).add(inputSrc);
          if (!isBundleImage) {
            replaceImageSources.call(this, currentElement, inputSrc);
          }
          this.selectComponent('alt', isBundleImage);
          range = editor.selection.getRangy();
          (currentElement = jquery(range.startContainer).closest("[md-inline='image']")).attr(
            'data-src',
            resolvedSource,
          );
          return currentElement;
        }
        var start = range.getBookmark(element[0]).start,
          insertCommand = undoManager.makeEmptyCommand();
        insertCommand.undo.push(editor.selection.buildUndo());
        userOperations.insertInlineText(
          editor,
          documentNode,
          imageMarkdown,
          start,
          insertCommand,
          true,
        );
        insertCommand.src = inputSrc;
        var nodeElement = editor.findElemById(documentNode.cid);
        editor.brush.brushNode(documentNode.cid);
        nodeElement.removeClass('md-expand');
        range.moveToBookmark({
          containerNode: nodeElement[0],
          start: start + imageMarkdown.length,
          end: start + imageMarkdown.length,
        });
        (currentElement = jquery(range.startContainer).closest('.md-image'))
          .find('img')
          .attr('src', 'file://' + inputSrc);
        editor.undo.register(insertCommand);
        console.debug(window.getSelection());
        return currentElement;
      }
      sourcePath =
        File.isTextBundle() || File.isTextPack() ? sourcePath : this.resolveImagePath(sourcePath);
      var insertedElement,
        currentSrc = localSrc,
        receiver = this,
        currentEditor = this.editor,
        targetFolder = this.getTargetImageStorageFolder(false, true);
      (function () {
        var element,
          altText = generateImageAltText(),
          leadingSpace = getImageLeadingSpace(),
          range = currentEditor.selection.getRangy();
        if (
          range &&
          (element = jquery(range.startContainer).closest("[md-inline='image']")).length &&
          !(function (inputRange) {
            if (
              inputRange.startContainer.parentElement.classList.contains('md-image-after-src') &&
              inputRange.startContainer.textContent.length == inputRange.startOffset
            ) {
              return true;
            }
          })(range)
        ) {
          replaceImageSources.call(this, element, localSrc);
          this.selectComponent('alt');
        } else {
          userOperations.pasteHandler(
            this.editor,
            leadingSpace + '![' + altText + '](' + sourcePath + ')',
            true,
            true,
          );
          var previousCommand = this.editor.undo.lastRegisteredOperationCommand();
          if (previousCommand) {
            previousCommand.src = localSrc;
          }
        }
      }).call(this);
      if (this.shouldTriggerMove(currentSrc, targetFolder) && targetFolder) {
        if ('upload' == targetFolder) {
          receiver.editor.brush.clearAndPause();
          insertedElement = insertInlineImage.call(receiver, currentSrc, true);
          receiver.uploadAction(insertedElement);
          receiver.editor.brush.resume();
        } else {
          if (targetFolder) {
            currentSrc = fileIntegration.normalizePath(currentSrc);
            this.editor.brush.clearAndPause();
            insertedElement = insertInlineImage.call(this, currentSrc);
            receiver.prepImageMove(targetFolder, File.isMac).then(
              function () {
                moveImageElements.call(receiver, insertedElement, targetFolder, currentSrc);
              },
              () => {
                finishImageTransfer(currentSrc);
              },
            );
            return void this.editor.brush.resume();
          }
        }
      }
    }
    doInsertVideoFromURL(videoUrl) {
      var videoHtml = '<video src="{url}"></video>'.replace('{url}', videoUrl);
      userOperations.pasteHandler(this.editor, videoHtml, false);
    }
    doInsertAudioFromURL(audioUrl) {
      var audioHtml = '<audio src="{url}"></audio>'.replace('{url}', audioUrl);
      userOperations.pasteHandler(this.editor, audioHtml, false);
    }
    resolveImagePath(textSlice) {
      if (/^\/\//.exec(textSlice)) {
        return 'https://' + textSlice;
      }
      if (/^data:/.exec(textSlice)) {
        return textSlice;
      }
      if (/^[^:]+:\/\//.exec(textSlice)) {
        return textSlice;
      }
      if (/^\/textbundle\//.exec(textSlice)) {
        return 'assets/' + textSlice.substring('/textbundle/'.length);
      }
      if (!textSlice) {
        return textSlice;
      }
      function escapeInsertedImageUrl(imageUrl) {
        if (File.option.autoEscapeImageURL) {
          return utilities.escapeURL(imageUrl);
        } else {
          return imageUrl;
        }
      }
      var localRootUrl = this.getLocalRootUrlForInsert(),
        searchValue = fileIntegration.getCurrentFileFolderPath();
      if (File.isTextBundle()) {
        textSlice = utilities.getRelativePath(localRootUrl, textSlice, false, false);
        if (!(!localRootUrl || ('/' != textSlice[0] && '\\' != textSlice[0]))) {
          textSlice = textSlice.substring(1);
        }
      } else {
        if (File.isTextPack()) {
          textSlice = utilities.getRelativePath(localRootUrl, textSlice, false, false);
          if (!(!localRootUrl || ('/' != textSlice[0] && '\\' != textSlice[0]))) {
            textSlice = textSlice.substring(1);
          }
        } else {
          if (localRootUrl && localRootUrl.length) {
            var text = utilities.getRelativePath(
              localRootUrl,
              textSlice,
              false,
              File.option.relativePathWithDot,
            );
            if (localRootUrl == searchValue) {
              text = text.replace(/^\s*(\\\\|\/)/, '');
            }
            textSlice =
              (!text.match(/^\.[\/\\]/) && this.editor.docMenu.getLocalRootUrl() ? '/' : '') + text;
          } else {
            if (
              !File.option.useRelativePathForImg ||
              !searchValue ||
              0 !== textSlice.indexOf(searchValue)
            ) {
              return escapeInsertedImageUrl(textSlice);
            }
            textSlice = textSlice
              .substring(searchValue.length)
              .replace(/^\//, '')
              .replace(/\\/, '/');
            if (File.option.relativePathWithDot) {
              textSlice = './' + textSlice;
            }
          }
        }
      }
      if (File.isWin) {
        textSlice = textSlice.replace(/[\/\\]{1,2}/g, '/');
      }
      return escapeInsertedImageUrl(textSlice);
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
      if (!(commandText || 'custom' !== File.option.imageUploader)) {
        commandText = (File.option.customImageUploader || '')
          .replace('${filepath}', File.bundle.filePath || '')
          .replace('${filename}', (File.getFileName() || '').replace(/\.[^.\/\\]+$/, ''));
      }
      return commandText || '';
    }
    getImageUploader() {
      var text =
        this.editor.localSettingBridge &&
        this.editor.localSettingBridge.getSetting(copyImagesPreferenceKey);
      if (text && !File.editor.sourceView.inSourceMode && 'ipic' == text.toLowerCase()) {
        return 'ipic';
      } else {
        if ('custom' == File.option.imageUploader) {
          return this.getImageUploaderCommand(File.option.imageUploader);
        } else {
          return File.option.imageUploader;
        }
      }
    }
    isFixedImageStorageFolder() {
      function isAbsoluteFolderPath(folderPath) {
        if (folderPath) {
          return utilities.isAbsolutePath(folderPath);
        }
      }
      if (File.isTextBundle()) {
        return false;
      }
      if (File.isTextPack()) {
        return false;
      }
      var storageSetting =
        (this.editor.localSettingBridge &&
          this.editor.localSettingBridge.getSetting(copyImagesPreferenceKey)) ||
        '';
      return (
        'textbundle' !== storageSetting &&
        (storageSetting
          ? isAbsoluteFolderPath(storageSetting)
          : File.option.defaultImageStorage
            ? isAbsoluteFolderPath(File.option.defaultImageStorage)
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
      if (File.isTextBundle() || File.isTextPack()) {
        return 'textbundle';
      }
      if (text && !File.editor.sourceView.inSourceMode) {
        if (
          (File.option.allowImageUpload || allowImageUpload) &&
          ('ipic' == text.toLowerCase() || 'upload' == text.toLowerCase())
        ) {
          return 'upload';
        }
        var documentFolder = fileIntegration.getCurrentFileFolderPath();
        if (documentFolder) {
          if (!/[\\/]$/.exec(documentFolder[documentFolder.length - 1])) {
            documentFolder += '/';
          }
          return fileIntegration.normalizePath(
            documentFolder +
              text.replace(/\${filename}/g, (File.getFileName() || '').replace(/\.[^.\/\\]+$/, '')),
            true,
          );
        }
      }
      if (documentSettingOnly) {
        return null;
      } else {
        return this.getTargetImageStorageFolderFromSetting();
      }
    }
    getRealTargetImageStorageFolder(targetFolder) {
      if ('textbundle' === targetFolder && File.isNode) {
        return this.assetsFolderForTextBundle();
      } else {
        return targetFolder;
      }
    }
    getTargetImageStorageFolderFromSetting() {
      if (
        'ipic' == File.option.defaultImageStorage ||
        'upload' == File.option.defaultImageStorage
      ) {
        return 'upload';
      }
      var text = fileIntegration.getCurrentFileFolderPath();
      if (this.cachedFileImageStorage) {
        return this.cachedFileImageStorage;
      }
      var defaultImageStorage = File.option.defaultImageStorage;
      if (text) {
        if (!/[\\/]$/.exec(text[text.length - 1])) {
          text += '/';
        }
      }
      if ('folder' == defaultImageStorage) {
        if (text) {
          this.cachedFileImageStorage = fileIntegration.normalizePath(
            text.replace(/[\\/]$/, ''),
            true,
          );
          return this.cachedFileImageStorage;
        }
      } else {
        if ('assert' == defaultImageStorage) {
          if (text) {
            this.cachedFileImageStorage = fileIntegration.normalizePath(text + 'assets', true);
            return this.cachedFileImageStorage;
          }
        } else {
          if ('per-file-assert' == defaultImageStorage) {
            if (text) {
              this.cachedFileImageStorage = fileIntegration.normalizePath(
                text + File.getFileName().replace(/\.[^.\/\\]+$/, '') + '.assets',
                true,
              );
              return this.cachedFileImageStorage;
            }
          } else {
            if ('textbundle' == defaultImageStorage) {
              return defaultImageStorage;
            }
            if (defaultImageStorage && !DocumentNode.isType(defaultImageStorage, 'upload')) {
              var currentText = File.getFileName();
              if (defaultImageStorage.indexOf('${filename}') > -1) {
                if (!currentText) {
                  return null;
                }
                defaultImageStorage = defaultImageStorage.replace(
                  /\${filename}/g,
                  currentText.replace(/\.[^.\/\\]+$/, ''),
                );
              }
              if (
                File.isWin
                  ? /^[^\/\\]+:[\/\\]/.exec(defaultImageStorage)
                  : /^[\\\/]/.exec(defaultImageStorage)
              ) {
                this.cachedFileImageStorage = fileIntegration.normalizePath(
                  defaultImageStorage,
                  true,
                );
              } else {
                if (text) {
                  this.cachedFileImageStorage = fileIntegration.normalizePath(
                    text + defaultImageStorage,
                    true,
                  );
                }
              }
            }
          }
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
      async function deleteMovedMedia(moveCommand, sourcePath) {
        await File.editor.imgEdit.deleteMedia(sourcePath, true, moveCommand);
      }
      var items = this.buildImageMap(),
        moveCommand = await this._copyAllImages(assetsFolder, true),
        singleDocumentFolder = await (async function () {
          for (
            var directoryPath = pathUtilities.dirname(documentPath),
              folderEntries = await fileSystem.readdir(directoryPath),
              documentCount = 0,
              entryIndex = 0;
            entryIndex < folderEntries.length;
            entryIndex++
          ) {
            if (
              File.SupportedTextFiles.indexOf(fileIntegration.getExtension(folderEntries[1])) > -1
            ) {
              documentCount++;
            }
            if (documentCount > 1) {
              return null;
            }
          }
          return directoryPath;
        })(),
        filteredItems = items.filter(
          (item) =>
            !(
              0 == item.indexOf(assetsFolder + File.isWin ? '\\' : '/') ||
              !isAbsoluteImagePath(item) ||
              (0 === pathUtilities.dirname(item).indexOf(pathSeparator + documentBaseName)
                ? (deleteMovedMedia(moveCommand, item), 1)
                : singleDocumentFolder &&
                  0 === item.indexOf(item + pathSeparator) &&
                  (deleteMovedMedia(moveCommand, item), 1))
            ),
        );
      if (filteredItems.length) {
        filteredItems.forEach(function (item) {
          deleteMovedMedia(moveCommand, item);
        });
      }
    }
    async onFileMoved(oldDocumentPath, text) {
      this.cachedFileImageStorage = void 0;
      if (this.editor.localSettingBridge) {
        var receiver = this,
          currentText = this.getTargetImageStorageFolder();
        if (
          text !== currentText &&
          text &&
          currentText &&
          utilities.pathByDeleteLastComponent(text) ==
            utilities.pathByDeleteLastComponent(oldDocumentPath) &&
          receiver.buildImageMap(isWithinImageFolder, true) &&
          (await (async function (folderPath) {
            try {
              if (File.isNode) {
                var fileSystem = reqnode('node:fs/promises');
                if (await fileSystem.stat(folderPath)) {
                  return true;
                }
              } else {
                if (File.isMac) {
                  return await JSBridge.invoke('shell.isFolder', folderPath);
                }
              }
            } catch (error) {
              return false;
            }
          })(text)) &&
          (await (async function () {
            var displayFolder = utilities.getFolder(currentText),
              mountFolder = File.getMountFolder();
            if (0 == currentText.lastIndexOf(mountFolder)) {
              displayFolder = currentText.substr(mountFolder.length + 1);
            }
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
          })())
        ) {
          await this._copyAllImages(currentText, true, isWithinImageFolder, true);
          (async function (folderPath) {
            if (File.isNode) {
              try {
                var fileSystem = reqnode('node:fs/promises');
                await fileSystem.rmdir(folderPath, { recursive: false, force: false });
              } catch (error) {
                console.debug(error);
              }
            } else {
              if (File.isMac) {
                await JSBridge.invoke('shell.removeIfEmpty', folderPath);
              }
            }
          })(text);
        }
      }
      function isWithinImageFolder(sourcePath) {
        return 0 == sourcePath.indexOf(text.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/'));
      }
    }
    revealInFinder() {
      var imageSource = jquery('.md-expand img').attr('src') || '';
      if (/^(wk)?file:/.exec(imageSource)) {
        var absolutePath = utilities.absolutePathFrom(imageSource);
        JSBridge.showInFinder(absolutePath);
      } else {
        if (/^https?:/.exec(imageSource)) {
          JSBridge.showInBrowser(imageSource);
        }
      }
    }
    async copyImage() {
      var imageElement = jquery('.md-expand.md-img-loaded');
      if (imageElement) {
        var currentPath = this.getSrcFromDom(imageElement[0], true);
        if (File.isNode) {
          await (async function () {
            var clipboardImage,
              { clipboard: clipboard, nativeImage: nativeImage } = reqnode('electron');
            clipboardImage = /^https?:/.exec(currentPath)
              ? nativeImage.createFromBuffer(
                  Buffer.from(await (await fetch(currentPath)).arrayBuffer()),
                )
              : nativeImage.createFromPath(currentPath);
            clipboard.writeText(currentPath);
            var outerHTML = (imageElement.find('img')[0] || {}).outerHTML;
            if (outerHTML) {
              clipboard.writeHTML(outerHTML);
            }
            if (/\.gif/.exec(currentPath)) {
              clipboard.writeImage(nativeImage.createFromBuffer(clipboardImage.toBitmap()));
            } else {
              clipboard.writeImage(clipboardImage);
            }
          })();
        }
        if (File.isMac) {
          await (async function () {
            var otherData = {};
            if (/\.svg$/.exec(currentPath)) {
              var outerHTML = (imageElement.find('img')[0] || {}).outerHTML;
              if (outerHTML) {
                otherData['text/html'] = outerHTML;
              }
              otherData['image/svg+xml'] = await (await fetch(currentPath)).text();
            }
            bridge.callHandler('clipboard.writeImage', {
              otherData: otherData,
              path: currentPath,
            });
          })();
        }
      }
    }
    moveImageTo_(imageElements, targetFolder, sourcePath, filenameDefined, deleteOriginal) {
      moveImageElements.call(
        this,
        imageElements,
        targetFolder,
        sourcePath,
        filenameDefined,
        false,
        deleteOriginal,
      );
    }
    async deleteImageAction(deleteOriginal) {
      var imageElement = jquery('.md-expand.md-img-loaded');
      if (imageElement) {
        var editor = this.editor,
          sourcePath = this.getSrcFromDom(imageElement[0], true);
        editor.selection.selectAllElem(imageElement);
        var deleteCommand = userOperations.backspaceHandler(
          editor,
          null,
          'delSelection',
          false,
          false,
        );
        if (deleteCommand && deleteCommand == editor.undo.lastRegisteredOperationCommand()) {
          if (deleteOriginal && isAbsoluteImagePath(sourcePath)) {
            if (
              !File.isTextBundle() &&
              !File.isTextPack() &&
              !(await this.shouldContinue('Delete original image file?', 'noWarningForDeleteImage'))
            ) {
              return;
            }
          } else {
            deleteOriginal = false;
          }
          await this.deleteMedia(sourcePath, true, deleteCommand);
        }
      }
    }
    async shouldContinue(message, suppressionSetting) {
      if (File.option[suppressionSetting]) {
        return true;
      }
      var { response: buttonIndex, checkboxChecked: dontAskAgain } =
        await dialogs.showWarningDialog(jquery.localize.getString(message), true);
      return (
        0 == buttonIndex &&
        (dontAskAgain &&
          (JSBridge.execForAll(
            'window.File && File.option && (File.option.' + suppressionSetting + ' = true)',
          ),
          JSBridge.putSetting(suppressionSetting, true)),
        true)
      );
    }
    async copyToSelectedFolderAction(deleteOriginal) {
      var imageElement = jquery('.md-expand.md-img-loaded');
      if (imageElement) {
        var destinationPath,
          sourcePath = this.getSrcFromDom(imageElement[0], true),
          suggestedName = fileIntegration.getFileNameFromPath(sourcePath, true);
        if (/^data:/.exec(sourcePath)) {
          var imageExtension = (/^data:[\\\/]*image\/([^;]+)/.exec(sourcePath) || [])[1];
          suggestedName = imageElement.find('img').attr('alt') || new Date() + '';
          if (imageExtension) {
            suggestedName = suggestedName + '.' + imageExtension;
          }
        }
        if (deleteOriginal && isAbsoluteImagePath(sourcePath)) {
          if (
            !(await this.shouldContinue(
              'Move image will delete the image file at original path, are you sure to continue?',
              'noWarningForMoveImage',
            ))
          ) {
            return;
          }
        } else {
          deleteOriginal = false;
        }
        if (
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
          destinationPath != sourcePath
        ) {
          this.moveImageTo_(imageElement, destinationPath, sourcePath, true, deleteOriginal);
        }
      }
    }
    async copyToTargetFolderAction(deleteOriginal) {
      this.editor.brush.clearAndPause();
      var imageElement = jquery('.md-expand.md-img-loaded');
      if (imageElement) {
        var sourcePath = this.getSrcFromDom(imageElement[0], true),
          targetFolder = this.getTargetImageStorageFolder(),
          receiver = this;
        if (deleteOriginal && isAbsoluteImagePath(sourcePath)) {
          if (
            !(await receiver.shouldContinue(
              'Move image will delete the image file at original path, are you sure to continue?',
              'noWarningForMoveImage',
            ))
          ) {
            return;
          }
        } else {
          deleteOriginal = false;
        }
        if (sourcePath) {
          this.prepImageMove(targetFolder, File.isMac).then(
            function () {
              receiver.moveImageTo_(imageElement, targetFolder, sourcePath, void 0, deleteOriginal);
            },
            () => {},
          );
        }
        this.editor.brush.resume();
      }
    }
    switchPattern(element, useHtmlTag, validateAttributes, recordHistory) {
      if (!(element = element || jquery('.md-expand.md-image')).length) {
        return false;
      }
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
        if (currentPattern == NodeType.imgtag) {
          return false;
        }
        var imgElement = document.createElement('img');
        imgElement.setAttribute('src', imageToken.src);
        if (imageToken.alt) {
          imgElement.setAttribute('alt', imageToken.alt);
        }
        if (imageToken.title) {
          imgElement.setAttribute('title', imageToken.title);
        }
        imageToken.markdown = imgElement.outerHTML
          .replace(/<\/img>$/, '')
          .replace(/\s*>$/, ' />')
          .replace(/&amp;/g, '&');
        renderedHtml = inlineDecoration.decorateImage(
          imageToken,
          imageToken.markdown,
          imageToken.src,
        );
        replacementElement = jquery(renderedHtml);
        element.replaceWith(replacementElement);
        if (recordHistory) {
          nodeId = element.closest('[cid]').attr('cid');
          this.editor.undo.addSnap(nodeId, SnapFlag.NONE);
        }
        return [imageToken, replacementElement];
      }
      if (currentPattern == NodeType.image) {
        return false;
      }
      if (currentPattern == NodeType.imgtag && validateAttributes) {
        for (var attributePattern = /(\w+)\s*=\s*(["']).+?\2/g; attributePattern.exec(void 0); ) {
          if (!['src', 'title', 'alt'].exec((void 0)[1].toLowerCase())) {
            return false;
          }
        }
      }
      var textParts = [
        '![' + imageToken.alt.replace(/]/g, '') + '](',
        imageToken.src,
        (imageToken.title ? JSON.stringify(title) : '') + ')',
      ];
      imageToken.markdown = textParts.join('');
      renderedHtml = inlineDecoration.decorateImage(
        imageToken,
        imageToken.markdown,
        imageToken.src,
        textParts,
      );
      replacementElement = jquery(renderedHtml);
      element.replaceWith(replacementElement);
      if (recordHistory) {
        this.editor.undo.addSnap(nodeId, SnapFlag.REPLACE);
      }
      return [imageToken, replacementElement];
    }
    ensureOneImg(imageElement) {
      if ((imageElement = imageElement || jquery('.md-expand.md-img-loaded'))) {
        if (1 == imageElement.length) {
          return imageElement;
        } else {
          this.editor.brush.expand(true, true, true);
          return jquery('.md-expand.md-img-loaded');
        }
      }
    }
    addStyle(element, styleProperty, styleValue) {
      if ((element = this.ensureOneImg(element))) {
        var nodeId = element.closest('[cid]').attr('cid');
        this.editor.undo.addSnap(nodeId, SnapFlag.NONE);
        if (styleValue || element.attr('md-inline') == NodeType.imgtag) {
          var imageToken,
            imageElement = element.find('img');
          if (element.attr('md-inline') != NodeType.imgtag) {
            var conversionResult = this.switchPattern(element, true, false, true);
            if (conversionResult) {
              imageToken = conversionResult[0];
              element = conversionResult[1];
            }
          } else {
            imageToken = {
              type: NodeType.imgtag,
              title: imageElement.attr('title'),
              alt: imageElement.attr('alt'),
              src: element.attr('data-src') || imageElement.attr('src'),
              markdown: element.text(),
            };
          }
          var imgElement = document.createElement('img'),
            hasStyleAttribute = false;
          imageToken.markdown = imageToken.markdown.replace(
            /(style\s*=\s*)(['"])(.*?)\2/,
            function (unusedParameter1, attributePrefix, unusedParameter3, styleText) {
              imgElement.setAttribute('style', styleText || '');
              hasStyleAttribute = true;
              imgElement.style[styleProperty] = styleValue;
              var attributeValue = imgElement.getAttribute('style');
              if (attributeValue) {
                return attributePrefix + JSON.stringify(attributeValue);
              } else {
                return '';
              }
            },
          );
          if (!hasStyleAttribute) {
            imageToken.markdown = imageToken.markdown
              .replace(/(\s*\/?>)/, ' style="' + styleProperty + ':' + styleValue + ';" $1')
              .replace(/\s+\/>$/, ' />');
          }
          var renderedHtml = inlineDecoration.decorateImage(
              imageToken,
              imageToken.markdown,
              imageToken.src,
            ),
            replacementElement = jquery(renderedHtml);
          element.replaceWith(replacementElement);
          replacementElement.find('img').click();
          this.editor.undo.addSnap(nodeId, SnapFlag.REPLACE);
        }
      }
    }
    zoomAction(imageElement, zoomValue) {
      if ((imageElement = imageElement || jquery('.md-expand.md-img-loaded'))) {
        this.addStyle(imageElement, 'zoom', '100%' == zoomValue ? '' : zoomValue);
      }
    }
    quickUploadValidation(showWarning) {
      var uploaderType = this.getImageUploader();
      if (uploaderType) {
        return uploaderType;
      }
      if (showWarning) {
        var message = jquery.localize.getString(
          'Please set an image uploader in Preferences panel before using this function.',
          'Panel',
        );
        if (File.isMac) {
          bridge.callHandler('controller.showErrorDialog', message);
        } else {
          dialogs.showDialog({ message: message });
        }
      }
      return false;
    }
    validateBeforeUpload() {
      var receiver = this;
      return new Promise(function (resolvePromise) {
        var uploaderType = receiver.quickUploadValidation(true);
        if (uploaderType) {
          if (File.isMac && 'ipic' == uploaderType) {
            bridge.callHandler('images.iPicValidateBeforeUpload', resolvePromise);
          } else {
            resolvePromise(true);
          }
        } else {
          resolvePromise(false);
        }
      });
    }
    uploadAction(element, skipDimensionCache) {
      if ((element = element || jquery('.md-expand.md-img-loaded'))) {
        var receiver = this;
        this.validateBeforeUpload().then((result) => {
          var sourcePath = utilities.absolutePathFrom(
            receiver.getRealSrc(element.attr('data-src')),
          );
          if (!result) {
            finishImageTransfer(sourcePath);
            return void clearImageTransferState(element);
          }
          uploadImageElements.call(receiver, element, sourcePath).then(
            function (inputResult) {
              if (!skipDimensionCache) {
                rememberMovedImageDimensions(inputResult, sourcePath, element);
              }
              element = finishImageTransfer(sourcePath);
              replaceImageSources.call(receiver, element, inputResult);
            },
            function (inputResult) {
              element = finishImageTransfer(sourcePath);
              replaceImageSources.call(receiver, element, sourcePath);
              if (inputResult) {
                setTimeout(function () {
                  receiver.showError(inputResult);
                }, 500);
              }
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
        true,
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
          searchValue = _options.userDataPath + (File.iwWin ? '\\' : '/') + 'marklyra-user-images';
        dialogs.hideNotification();
        try {
          await Promise.all(
            items.map((item) =>
              copyImageToFolder
                .call(receiver, jquery(imageMap[item]), targetFolder, item, false, true)
                .then(([destinationPath, backupPath]) => {
                  currentItems.push([item, destinationPath, backupPath]);
                }),
            ),
          );
          pendingMediaChanges = Promise.all(
            currentItems.map((item) => {
              var [sourcePath, destinationPath, backupPath] = item;
              if (void 0 !== destinationPath) {
                var imageElements = finishImageTransfer(sourcePath);
                rememberMovedImageDimensions(
                  destinationPath,
                  sourcePath,
                  imageElements.find('img')[0],
                );
                var updateCommand = replaceImageSources.call(
                  receiver,
                  imageElements,
                  destinationPath,
                  true,
                );
                if (moveCommand) {
                  undoManager.append(moveCommand, updateCommand);
                } else {
                  moveCommand = updateCommand;
                }
                var deleteSource = deleteOriginal;
                if (forTextBundle) {
                  deleteSource = deleteOriginal || 0 == sourcePath.indexOf(searchValue);
                }
                return recordMediaMoveHistory(
                  moveCommand,
                  sourcePath,
                  destinationPath,
                  backupPath,
                  deleteSource,
                );
              }
            }),
          ).then(function () {
            return moveCommand;
          });
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
          if (forTextBundle) {
            notificationMessage = jquery.localize.getString('Images saved to TextBundle');
          }
          if (!forTextBundle) {
            dialogs.showNotification(notificationMessage, true);
          }
          await pendingMediaChanges;
        }
      }
    }
    moveAllImages() {
      return this.copyAllImages(true);
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
      } else {
        bridge.callHandler('images.startCopyAllImages', [defaultPath, deleteOriginal || false]);
      }
    }
    uploadAllImages() {
      if (this.quickUploadValidation(true)) {
        var items = this.buildImageMap(),
          receiver = this;
        runImageUploader
          .call(this, items)
          .then((result) => {
            dialogs.hideNotification();
            var replacementMap = {};
            items.forEach((item, itemIndex) => {
              replacementMap[item] = result[itemIndex];
            });
            receiver.replaceImageMap(replacementMap, true);
          })
          .catch((error) => {
            receiver.showError(error, 'Failed to upload images:');
          });
        if (Object.keys(items).length) {
          dialogs.hideNotification();
          dialogs.showProcessingNotification(
            jquery.localize.getString('Uploading in progress…', 'Panel'),
          );
        } else {
          dialogs.showNotification(
            jquery.localize.getString('No local images found.', 'Panel'),
            void 0,
            void 0,
            void 0,
            true,
          );
        }
      }
    }
    contextMenuItems(element) {
      var text = (element.getAttribute('src') || '').replace(/\?(.+)$/, ''),
        items = [],
        canCopyImage = !element.closest('.md-img-error'),
        currentText = this.getTargetImageStorageFolder();
      if (currentText && 'upload' != currentText) {
        currentText = currentText.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/');
      }
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
        if (localText) {
          items.push('copyImgToTarget-' + localText.replace(/\|/g, ''));
        }
      }
      var match = /^(wk)?file:\/\//.exec(text);
      if (canCopyImage) {
        items.push('copyImgToSelect');
        if (match) {
          if (localText) {
            items.push('moveImgToTarget-' + localText.replace(/\|/g, ''));
          }
          items.push('moveImgToSelect');
        }
        if ('upload' == currentText) {
          items.unshift('uploadImg');
        } else {
          items.push('uploadImg');
        }
        items.push('copyImg');
      }
      if (match) {
        items.unshift('revealImgInFinder');
      } else {
        if (/^https?:\/\//.exec(text)) {
          items.unshift('revealImgInBrowser');
        }
      }
      var attributeValue = element.getAttribute('data-pixel-ratio');
      if (attributeValue && 1 != (attributeValue -= 0)) {
        items.push('zoomImgTo-' + utilities.floatToPercent(1 / attributeValue));
      }
      items.push('zoomImg');
      if (element.closest("[md-inline='image']")) {
        items.push('imgSyntaxMarkdown');
      }
      if (element.closest("[md-inline='imgtag']")) {
        items.push('imgSyntaxHTML');
      }
      if (match) {
        items.push('deleteImgFile');
      } else {
        items.push('deleteImg');
      }
      return items;
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
          hasExplicitZoom = (zoomValue) =>
            1 != (zoomValue = (zoomValue || 1) - 0) && zoomValue != 1 / 0 && !isNaN(zoomValue);
        if (attributeValue) {
          if (hasExplicitZoom((attributeValue -= 0))) {
            items.push({
              label: 'Zoom Image to %@',
              key: 'zoom-smart',
              variable: utilities.floatToPercent(1 / attributeValue),
            });
          }
        } else {
          if (File.isMac) {
            bridge.callHandler(
              'images.getScale',
              lastUrl.replace(/^wkfile:/, 'file:'),
              function (inputAttributeValue) {
                if (hasExplicitZoom(inputAttributeValue)) {
                  domNode.setAttribute('data-pixel-ratio', inputAttributeValue);
                  items.splice(items.length - 1, 0, {
                    label: 'Zoom Image to %@',
                    key: 'zoom-smart',
                    variable: utilities.floatToPercent(1 / inputAttributeValue),
                  });
                  restoreInsertedImageCursor();
                }
              },
            );
          } else {
            if (File.isNode) {
              imageScale
                .getImageScaleByElection(lastUrl, domNode.nativeHeight)
                .then(function (inputAttributeValue) {
                  if (hasExplicitZoom(inputAttributeValue)) {
                    domNode.setAttribute('data-pixel-ratio', inputAttributeValue);
                    items.splice(items.length - 1, 0, {
                      label: 'Zoom Image to %@',
                      key: 'zoom-smart',
                      variable: utilities.floatToPercent(1 / inputAttributeValue),
                    });
                    restoreInsertedImageCursor();
                  }
                });
            }
          }
        }
        if (!File.isTextBundle() && !File.isTextPack()) {
          var text = this.getTargetImageStorageFolder();
          if (text && 'upload' != text) {
            text = text.replace(/[\\\/]$/, '') + (File.isWin ? '\\' : '/');
            lastUrl = utilities.absolutePathFrom(lastUrl);
            var variable,
              searchValue = utilities.escapeURL(text);
            if (
              0 != lastUrl.replace(/[\\]/g, '/').indexOf(searchValue) ||
              lastUrl.substring(searchValue.length + 1).match(/[\\\/]/g)
            ) {
              if ((variable = utilities.getFolder(text))) {
                items.push({ label: 'Copy to %@', key: 'copy-img-to-target', variable: variable });
              }
            } else {
              this.lastUrl = lastUrl;
            }
          }
          items.push({ label: 'Copy Image to…', key: 'select-img-target' });
          if (variable) {
            items.push({ label: 'Move to %@', key: 'move-img-to-target', variable: variable });
          }
          items.push({ label: 'Rename or Move Image to…', key: 'select-img-target-move' });
          if (!(File.isTextBundle() || File.isTextPack() || !this.quickUploadValidation())) {
            if ('upload' == text) {
              items.unshift({ label: 'Upload Image', key: 'upload-img' });
            } else {
              items.push({ label: 'Upload Image', key: 'upload-img' });
            }
          }
        }
        items.push({ label: 'Zoom Image', key: 'zoom-img', hasExtraMenu: true });
        if (items.length) {
          restoreInsertedImageCursor();
        }
      }
      function restoreInsertedImageCursor() {
        var range = editor.selection.getRangy(),
          element = jquery(range.endContainer).closest("[md-inline='image']");
        if (
          range &&
          element.length &&
          !element.hasClass('md-on-moving') &&
          !element.hasClass('md-on-uploading')
        ) {
          editor.lastCursor = editor.selection.buildUndo(range);
          editor.contextMenu.showCustom(items, 'image');
        }
      }
    }
    toggleUploadForFile() {
      if ('upload' == this.getTargetImageStorageFolder(true)) {
        this.doRemoveImageCopyToFolder(false);
      } else {
        if (this.quickUploadValidation(true)) {
          if (File.isNode && !this.checkAutoUploadIsAllowed(true)) {
            return;
          }
          this.doSetImageCopyToFolder('upload', true);
        }
      }
    }
    checkAutoUploadIsAllowed(showWarning, respectSuppression) {
      if (File.option.allowImageUpload) {
        return true;
      }
      if (showWarning) {
        if (respectSuppression && File.option.noWarnigUploadDisabled) {
          return false;
        }
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
            if (0 === buttonIndex) {
              if (File.isNode) {
                File.megaMenu.highlight('image-setting-group');
              } else {
                bridge.callHandler('setting.showAndHighlight', 'image-setting-group');
              }
            }
            if (dontAskAgain) {
              JSBridge.putSetting('noWarnigUploadDisabled', true);
              JSBridge.execForAll('File.option.noWarnigUploadDisabled = true;');
            }
          },
        });
      }
      return false;
    }
    toggleCopyToFolder() {
      var receiver = this,
        targetFolder = this.getTargetImageStorageFolder(true),
        documentFolder = fileIntegration.getCurrentFileFolderPath();
      File.refreshImageCopyStatus(true);
      if (!File.isLocked && !File.editor.sourceView.inSourceMode) {
        if (targetFolder) {
          this.doRemoveImageCopyToFolder(false);
        } else {
          if (!documentFolder) {
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
          }
          JSBridge.invoke('dialog.showOpenDialog', {
            defaultPath: fileIntegration.getCurrentFileFolderPath(),
            title: jquery.localize.getString('Select Container Folder'),
            properties: ['openDirectory', 'createDirectory'],
            buttonLabel: jquery.localize.getString('Select'),
          }).then(({ filePaths: folderPaths }) => {
            if (folderPaths && 0 != folderPaths.length) {
              receiver.doSetImageCopyToFolder(folderPaths[0]);
            }
          });
        }
      }
    }
    toggleUseImageRootPath() {
      var localRootUrl = this.editor.docMenu.getLocalRootUrl(),
        editor = this.editor;
      if (localRootUrl) {
        this.editor.docMenu.removeProperty('marklyra-root-url');
      } else {
        JSBridge.invoke('dialog.showOpenDialog', {
          defaultPath: fileIntegration.getCurrentFileFolderPath(),
          title: jquery.localize.getString('Select Container Folder'),
          properties: ['openDirectory', 'createDirectory'],
          buttonLabel: jquery.localize.getString('Select'),
        }).then(({ filePaths: folderPaths }) => {
          if (folderPaths && 0 != folderPaths.length) {
            editor.imgEdit.doSetImageRootPath(folderPaths[0]);
          }
        });
      }
    }
    doSetImageCopyToFolder(folderPath, uploadImages) {
      folderPath = uploadImages
        ? 'upload'
        : utilities.getRelativePath(fileIntegration.getCurrentFileFolderPath(), folderPath, true);
      this.editor.docMenu.writeProperty(copyImagesPreferenceKey, folderPath);
    }
    doSetImageRootPath(folderPath) {
      this.editor.docMenu.writeProperty(
        'marklyra-root-url',
        utilities.getRelativePath(fileIntegration.getCurrentFileFolderPath(), folderPath, true),
      );
    }
    doRemoveImageCopyToFolder(deferRegistration) {
      return this.editor.docMenu.removeProperty(copyImagesPreferenceKey, deferRegistration);
    }
  };
}
