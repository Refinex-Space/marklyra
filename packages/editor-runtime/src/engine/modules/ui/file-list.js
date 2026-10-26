// ui/file-list.
export default function initializeUiFileList(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var renderState,
    dateInstance,
    showFolderNames,
    timerId,
    utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    fileIntegration = (documentModel.TYPE, requireModule('host/file-integration')),
    dialogs =
      (requireModule('document/recovery'),
      (utilities = requireModule('shared/utilities')),
      requireModule('editing/keyboard-shortcuts').map,
      requireModule('ui/dialogs')),
    mediaActions = requireModule('media/actions'),
    jquery = requireModule('libraries/jquery'),
    currentElement = jquery('#file-library-list-children'),
    localElement = jquery('#file-library-list'),
    stripMarkdownForPreview = function (text) {
      if (File.option.strictMarkdown) {
        return text
          .replace(/^\s*(([\n>]+)|([-=*`\s]{3,}))/gm, '')
          .replace(/^\s*#+\s+/gm, '')
          .replace(/\s*[*_`$=]+\s*/gm, ' ')
          .replace(/\[([^\]]+)\]\([^)]*\)/gm, '$1');
      } else {
        return text
          .replace(/^\s*(([\n#>]+)|([-=*`\s]{3,}))/gm, '')
          .replace(/\s*[*_`$=]+\s*/gm, ' ')
          .replace(/\[([^\]]+)\]\([^)]*\)/gm, '$1');
      }
    },
    readMultilineMetadata = function (metadataLines, startLine, metadataValue, lineLimit) {
      for (var itemIndex = startLine + 1; itemIndex < lineLimit; itemIndex++) {
        if (metadataLines[itemIndex].indexOf(':') >= 0) {
          return metadataValue;
        }
        metadataValue += '\n' + metadataLines[itemIndex];
      }
      return metadataValue;
    },
    updateFileNameLabel = function (itemElement, text) {
      var substringLength = text.lastIndexOf('.');
      if (substringLength < 0) {
        substringLength = text.length;
      }
      itemElement.find('.file-list-item-file-name-part').text(text.substr(0, substringLength));
      itemElement.find('.file-list-item-file-ext-part').text(text.substr(substringLength));
    },
    buildFilePreview = function (text, unusedParameter2) {
      var match,
        parts = text.split(/\r*\n+/),
        partsLength = parts.length;
      if ('---' == parts[0]) {
        for (var currentText, textParts = [], itemIndex = 1; itemIndex < partsLength; itemIndex++) {
          if ('---' == parts[itemIndex]) {
            if (textParts.length < 3) {
              textParts.push(
                stripMarkdownForPreview(parts.slice(itemIndex + 1).join('\n') || text),
              );
            }
            return textParts.join('\n');
          }
          if ((match = /^\s*(title)\s*:(.+)$/.exec(parts[itemIndex]))) {
            if ((currentText = readMultilineMetadata(parts, itemIndex, match[2], partsLength))) {
              textParts.push(currentText.trim());
            }
          } else {
            if ((match = /^\s*(subtitle)\s*:(.+)$/.exec(parts[itemIndex]))) {
              if ((currentText = readMultilineMetadata(parts, itemIndex, match[2], partsLength))) {
                textParts.push(currentText.trim());
              }
            } else {
              if (
                (match = /^\s*(overview|summary|description|excerpt)\s*:(.+)$/.exec(
                  parts[itemIndex],
                )) &&
                (currentText = readMultilineMetadata(parts, itemIndex, match[2], partsLength))
              ) {
                textParts.push(currentText.trim());
              }
            }
          }
        }
        return stripMarkdownForPreview(text);
      }
      return stripMarkdownForPreview(text);
    },
    statWrapper = fileIntegration.statWrapper;
  function trackUniquePath(filePath, items, checkOnly) {
    var pathSeparator = File.isWin ? '\\' : '/';
    if (
      items.find(function (item) {
        return item == filePath || 0 == filePath.indexOf(item + pathSeparator);
      })
    ) {
      return true;
    }
    if (!checkOnly) {
      items.push(filePath);
    }
  }
  var fetchLimit = 400;
  moduleRecord.exports = class {
    constructor(parent) {
      this.parent = parent;
      this.editor = parent.editor;
      this.$template = jquery(document.querySelector('#file-list-item-template').textContent);
      this.noGroup = File.option.listNoGroup || false;
      this.sortType = File.option.listSortType;
      this.setGroupByFolder(this.noGroup);
      this.registerBridge();
      this.needRepaint();
      if (File.isNode) {
        fetchLimit = Number.parseInt(File.option.maxFetchCountOnFileList) || 200;
        if (Number.isNaN(fetchLimit)) {
          fetchLimit = 200;
        }
      }
      console.debug('MAX_FETCH_COUNT on FileList: ' + fetchLimit);
    }
    registerBridge() {
      if (File.isMac) {
        var receiver = this;
        bridge.registerHandler('fileList.renderAll', function (renderPayload, reply) {
          if ('oversize' != renderState) {
            var fragment = document.createDocumentFragment();
            renderPayload[0].forEach(function (item) {
              receiver.appendItemToView(item, false, fragment);
            });
            currentElement.html('');
            currentElement.append(fragment);
            receiver.endRender(renderPayload[1], renderPayload[2], renderPayload[2]);
            if (reply) {
              reply(null);
            }
          }
        });
        bridge.registerHandler('fileList.appendItem', function (itemPayload, reply) {
          receiver.appendItemToView(itemPayload[0], itemPayload[1], void 0, {
            forceMark: itemPayload[2],
          });
          if (reply) {
            reply(null);
          }
        });
      }
    }
    isShown() {
      return this.parent.isFileTabShown() && !this.parent.useTreeStyle;
    }
    isRendering() {
      return renderState;
    }
    renderIfNeed() {
      return (
        !renderState &&
        (this.render(), File.isNode && this.parent.addWatch(File.getMountFolder()), true)
      );
    }
    appendTreeByNode(rootPath, onComplete, fetchedCount, element) {
      var fileSystemPlus = reqnode('fs-plus'),
        pathUtilities = reqnode('path'),
        receiver = this,
        useFsQueue = File.option.useFsQueue;
      fetchedCount = fetchedCount || 0;
      onComplete = onComplete || function () {};
      var hasTargetContainer = !!element;
      element = element || localElement;
      var items = [],
        pendingIo = 0,
        clearFilesystemQueue = function () {
          items = [];
        },
        drainFilesystemQueue = function () {
          if ('oversize' != renderState) {
            for (var batchCount = 0; batchCount < 20 && items.length; ) {
              batchCount++;
              var queuedTask = items.shift();
              if (queuedTask[1]) {
                readDirectory(queuedTask[0], queuedTask[2]);
              } else {
                readFileStats(queuedTask[0], queuedTask[2]);
              }
            }
          } else {
            clearFilesystemQueue();
          }
        },
        readDirectory = function (directoryPath, onRead) {
          pendingIo++;
          fileSystemPlus.readdir(directoryPath, function (error, fileNames) {
            pendingIo--;
            if (useFsQueue && pendingIo < 50) {
              drainFilesystemQueue();
            }
            onRead(error, fileNames);
          });
        },
        readFileStats = function (filePath, onStat) {
          pendingIo++;
          statWrapper(filePath, function (fileInfo) {
            pendingIo--;
            if (useFsQueue && pendingIo < 50) {
              drainFilesystemQueue();
            }
            onStat(fileInfo);
          });
        },
        walkDirectory = function (separator, onFile, onDirectory, onComplete) {
          if (!separator) {
            return onComplete();
          }
          !(function (directoryPath, onRead) {
            if (useFsQueue && pendingIo >= 50) {
              items.push([directoryPath, true, onRead]);
            } else {
              readDirectory(directoryPath, onRead);
            }
          })(separator, function (readError, inputItems) {
            if (readError) {
              return onComplete(void 0, readError);
            }
            var itemsLength = inputItems.length;
            if (!itemsLength) {
              onComplete();
            }
            var completeDirectoryEntry = function () {
              if (--itemsLength <= 0) {
                onComplete();
              }
            };
            inputItems.forEach(function (item) {
              var entryPath = pathUtilities.join(separator, item);
              !(function (filePath, onStat) {
                if (useFsQueue && pendingIo >= 50) {
                  items.push([filePath, false, onStat]);
                } else {
                  readFileStats(filePath, onStat);
                }
              })(entryPath, function (fileInfo) {
                if (renderState) {
                  if (!fileInfo || fileInfo.shouldIgnore) {
                    return completeDirectoryEntry();
                  }
                  if (
                    50 == fetchedCount &&
                    true === renderState &&
                    'rendering' != element.attr('data-state')
                  ) {
                    element.attr('data-state', 'rendering');
                  }
                  if (fetchedCount > fetchLimit) {
                    clearFilesystemQueue();
                    return void receiver.endRender(true);
                  }
                  if (fileInfo.isFile) {
                    if (onFile(fileInfo, item, separator, entryPath, completeDirectoryEntry)) {
                      fetchedCount++;
                    }
                  } else {
                    if (fileInfo.isDir && onDirectory(fileInfo, item, separator, entryPath)) {
                      walkDirectory(entryPath, onFile, onDirectory, completeDirectoryEntry);
                    } else {
                      completeDirectoryEntry();
                    }
                  }
                }
              });
            });
          });
        };
      walkDirectory(
        rootPath,
        function (fileInfo, name, folderPath, path, onComplete) {
          if (!fileInfo.shouldIgnore) {
            var fileEntry = {
              folderPath: folderPath,
              folderName: fileIntegration.getFileNameFromPath(folderPath),
              name: name,
              path: path,
              lastModified: fileInfo.mtime,
              createDate: fileInfo.birthtime,
            };
            receiver.fetchSummaryByNode(path, fileInfo, function (summary) {
              fileEntry.summary = summary;
              receiver.appendItemToView(fileEntry, false, hasTargetContainer ? element[0] : void 0);
              onComplete();
            });
            return true;
          }
          onComplete();
        },
        function (fileInfo, unusedParameter2, unusedParameter3, directoryPath) {
          return !fileInfo.shouldIgnore && (receiver.parent.addWatchByUnix(directoryPath), true);
        },
        onComplete,
      );
    }
    fetchAllDocsByNode() {
      var receiver = this;
      this.parent.calcMountFolder(true).then(function (result) {
        receiver.appendTreeByNode(result || '', receiver.endRender.bind(receiver));
      });
    }
    fetchSummaryByNode(textFile, fileInfo, onSummary) {
      var summaryText,
        fileSystemPlus = reqnode('fs-plus');
      if (fileInfo.isBundle) {
        textFile = fileInfo.textFile;
      } else {
        if (/\.textpack$/.exec(textFile)) {
          onSummary('');
        }
      }
      fileSystemPlus
        .createReadStream(textFile, { start: 0, end: 600 })
        .on('data', function (contentChunk) {
          if ('string' == typeof contentChunk) {
            summaryText = contentChunk;
          } else {
            var text = fileIntegration.detectEncodeByNode(contentChunk),
              decodedText = fileIntegration.getContentFromBuffer(
                contentChunk,
                text.replace('-bom', ''),
                true,
              );
            summaryText = decodedText;
          }
        })
        .on('end', function () {
          if (void 0 === summaryText) {
            summaryText = '';
          }
          onSummary(summaryText);
        });
    }
    render(forceRefresh) {
      if (forceRefresh) {
        this.needRepaint();
      }
      if (!renderState) {
        renderState = true;
        dateInstance = new Date();
        showFolderNames = false;
        var receiver = this;
        setTimeout(function () {
          if (true === renderState && 'rendering' != localElement.attr('data-state')) {
            localElement.attr('data-state', 'rendering');
          }
        }, 500);
        currentElement.html('').removeClass('show-folder-name');
        if (File.isMac) {
          this.parent.calcMountFolder(true).then(function (result) {
            bridge.callHandler('library.fetchAllDocs', result || '');
          });
        } else {
          if (File.isNode) {
            this.fetchAllDocsByNode();
          }
        }
        setTimeout(function () {
          if (true === renderState && new Date() - dateInstance > 8e3) {
            console.warn('render file list timeout');
            receiver.endRender(true);
          }
        }, 1e4);
      }
    }
    endRender(oversize, loadFailed, unusedParameter3) {
      if ('oversize' != renderState || !oversize) {
        renderState = oversize ? 'oversize' : 'complete';
        jquery('#file-library-list').attr('data-state', renderState);
        if (timerId) {
          clearTimeout(timerId);
        }
        timerId = setTimeout(function () {
          if ('oversize' == renderState) {
            jquery('#file-library-list').attr('data-state', 'oversize-end');
          }
        }, 2e3);
        if (!oversize) {
          if (loadFailed && File.getMountFolder()) {
            return void this.parent.onLoadFolderFailed();
          }
          this.parent.markCurrentFile(false);
        }
        this.parent.silent = false;
      }
    }
    setSortType(sortType) {
      this.sortType = sortType;
      JSBridge.putSetting('listSortType', sortType);
      if ('complete' === renderState) {
        currentElement.html('');
        var fragment = document.createDocumentFragment();
        if (this.noGroup) {
          this.files.sort(this.parent.compareItem.bind(this.parent));
          this.files.forEach(function (item) {
            this.appendItemToView(item, false, fragment);
          }, this);
        } else {
          this.dirArr.forEach(function (item) {
            var content = item.content;
            item.content = [];
            content.forEach(function (inputItem) {
              this.appendItemToView(inputItem, false, fragment);
            }, this);
          }, this);
        }
        currentElement.append(fragment);
      }
    }
    setGroupByFolder(noGroup) {
      if (noGroup) {
        jquery('#marklyra-group-by-folder-btn').removeClass('active');
      } else {
        jquery('#marklyra-group-by-folder-btn').addClass('active');
      }
      if ('complete' === renderState && this.noGroup != noGroup) {
        this.noGroup = noGroup;
        JSBridge.putSetting('listNoGroup', noGroup);
        currentElement.html('');
        var fragment = document.createDocumentFragment();
        if (noGroup) {
          this.files = [];
          this.dirArr.forEach(function (item) {
            this.files = this.files.concat(item.content);
          }, this);
          this.dirArr = [];
          this.dirMap = {};
          this.files.sort(this.parent.compareItem.bind(this.parent));
          this.files.forEach(function (item) {
            this.appendItemToView(item, false, fragment);
          }, this);
        } else {
          this.dirArr = [];
          this.dirMap = {};
          this.files.forEach(function (item) {
            this.appendItemToView(item, false, fragment);
          }, this);
          this.files = [];
        }
        currentElement.append(fragment);
        if ('oversize' == renderState) {
          this.endRender(true);
        } else {
          if ('complete' == renderState) {
            this.endRender(false);
          }
        }
      }
    }
    getItem(path) {
      if (this.noGroup) {
        for (
          var filesLength = this.files.length, itemIndex = 0;
          itemIndex < filesLength;
          itemIndex++
        ) {
          if (this.files[itemIndex].path == path) {
            return this.files[itemIndex];
          }
          if (this.files[itemIndex].folderPath == path) {
            return { path: path, isDir: true };
          }
        }
      } else {
        if (this.dirMap[path]) {
          return { path: path, isDir: true };
        }
        var parentPath = utilities.pathByDeleteLastComponent(path);
        if (this.dirMap[parentPath]) {
          return this.dirMap[parentPath].content.find(function (item) {
            return item.path == path;
          });
        }
      }
    }
    getIndexOnView(listElement, viewIndex) {
      for (var itemIndex = 0; itemIndex < listElement.children.length; itemIndex++) {
        if (itemIndex >= viewIndex) {
          return viewIndex;
        }
        if (listElement.children[itemIndex].classList.contains('marklyra-to-remove')) {
          viewIndex++;
        }
      }
      return viewIndex;
    }
    computeIndex(fileEntry) {
      return (
        this.noGroup
          ? function (searchValue) {
              var insertionIndex = this.files.indexOf(searchValue);
              if (insertionIndex > -1) {
                return insertionIndex;
              }
              insertionIndex = 0;
              for (
                var itemIndex = 0;
                itemIndex < this.files.length &&
                !(this.parent.compareItem(this.files[itemIndex], searchValue) > 0);
                itemIndex++
              ) {
                insertionIndex++;
              }
              this.files.splice(insertionIndex, 0, searchValue);
              return insertionIndex;
            }
          : function (fileEntry) {
              var folderPath = fileEntry.folderPath,
                folderGroup = this.dirMap[folderPath],
                precedingCount = 0,
                groupIndex = 0;
              if (!folderGroup) {
                folderGroup = { path: folderPath, content: [] };
                this.dirArr.push(folderGroup);
                this.dirMap[folderPath] = folderGroup;
              }
              for (var itemIndex = 0; itemIndex < this.dirArr.length - 1; itemIndex++) {
                var precedingGroup = this.dirArr[itemIndex];
                if (precedingGroup.path == folderPath) {
                  break;
                }
                precedingCount += precedingGroup.content.length;
              }
              for (
                itemIndex = 0;
                itemIndex < folderGroup.content.length &&
                !(this.parent.compareItem(folderGroup.content[itemIndex], fileEntry) > 0);
                itemIndex++
              ) {
                groupIndex++;
              }
              folderGroup.content.splice(groupIndex, 0, fileEntry);
              return groupIndex + precedingCount;
            }
      ).call(this, fileEntry);
    }
    appendItemToView(fileEntry, unusedParameter2, targetContainer, renderOptions) {
      if ('oversize' != renderState && renderState) {
        var resolvedOptions = renderOptions || {},
          forceMark = resolvedOptions.forceMark,
          skipAnim = resolvedOptions.skipAnim,
          receiver = this,
          element = this.$template.clone();
        if (fileEntry && fileEntry.path && File.getMountFolder()) {
          if (!showFolderNames) {
            if (File.getMountFolder() != fileEntry.folderPath) {
              showFolderNames = true;
              currentElement.addClass('show-folder-name');
            }
          }
          element
            .attr('data-path', fileEntry.path)
            .attr('data-create-date', fileEntry.createDate - 0)
            .attr('data-parent-path', fileEntry.folderPath);
          element
            .find('.file-list-item-file-name')
            .attr('title', utilities.abbreviatingWithTilde(fileEntry.path));
          element.children('.file-list-item-parent-loc').text(fileEntry.folderName);
          element
            .children('.file-list-item-time')
            .text(utilities.date2NaturalLang(new Date(fileEntry.lastModified), true));
          updateFileNameLabel(element, fileEntry.name);
          var insertionIndex,
            summaryElement = element.children('.file-list-item-summary');
          summaryElement.text(buildFilePreview(fileEntry.summary, fileEntry.name));
          summaryElement.html(summaryElement.html().replace(/([^\s]+)\s*\n+/g, '$1<br/>'));
          if (fileEntry.path == fileIntegration.getCurrentFilePath()) {
            element.addClass('active');
          }
          if (targetContainer) {
            insertionIndex = this.computeIndex(fileEntry);
            targetContainer.insertChildAtIndex(element[0], insertionIndex);
          } else {
            var clientHeight,
              length,
              previousElement = this.removeItemFromView(fileEntry, true),
              wasActive = previousElement.hasClass('active');
            if (previousElement && previousElement.length) {
              length = previousElement.prevAll().length;
              insertionIndex = this.computeIndex(fileEntry);
              insertionIndex = this.getIndexOnView(currentElement[0], insertionIndex);
              if (length != insertionIndex || fileEntry.oldPath) {
                fileEntry.oldPath = void 0;
                clientHeight = previousElement[0].clientHeight;
                previousElement.remove();
                currentElement[0].insertChildAtIndex(element[0], insertionIndex);
                if (wasActive || forceMark) {
                  element.addClass('active');
                }
                if (!skipAnim) {
                  currentElement.children().each(function (rowIndex) {
                    var currentReceiver = this;
                    if (currentReceiver == element[0]) {
                      currentReceiver.style.transition = 'transform 0s';
                      currentReceiver.style.transform =
                        'translate(0px, ' + clientHeight * (length - rowIndex) + 'px)';
                    } else {
                      if (rowIndex >= insertionIndex && rowIndex < length) {
                        currentReceiver.style.transition = 'transform 0s';
                        currentReceiver.style.transform = 'translate(0px, -' + clientHeight + 'px)';
                      } else {
                        if (!(rowIndex >= length && rowIndex < insertionIndex)) {
                          return;
                        }
                        currentReceiver.style.transform = 'translate(0px, ' + clientHeight + 'px)';
                      }
                    }
                    requestAnimationFrame(function () {
                      currentReceiver.style.transform = '';
                      currentReceiver.style.transition = 'transform 400ms';
                    });
                  });
                }
                if (fileIntegration.getCurrentFilePath() == fileEntry.path) {
                  this.parent.markCurrentFile();
                }
                highlightNewFile();
                return element[0];
              } else {
                if (previousElement.find('input').length) {
                  return previousElement[0];
                } else {
                  previousElement.replaceWith(element);
                  highlightNewFile();
                  return element[0];
                }
              }
            }
            insertionIndex = this.computeIndex(fileEntry);
            insertionIndex = this.getIndexOnView(currentElement[0], insertionIndex);
            currentElement[0].insertChildAtIndex(element[0], insertionIndex);
          }
          highlightNewFile();
          return element[0];
        }
      }
      function highlightNewFile() {
        var nextChangeHighlight = receiver.parent.nextChangeHighlight;
        if (nextChangeHighlight && 0 == nextChangeHighlight.indexOf(fileEntry.path)) {
          receiver.highlight(nextChangeHighlight);
        }
      }
    }
    removeFileOrFolder(inputPath, immediate) {
      var receiver = this,
        pathSeparator = File.isWin ? '\\' : '/';
      function removeFileElement(filePath) {
        var element = receiver.findElemFromPath(filePath);
        if (element.length) {
          if (immediate) {
            element.remove();
          } else {
            element.addClass('marklyra-to-remove');
            element.hide(400, function () {
              element.remove();
            });
          }
        }
      }
      if (receiver.noGroup) {
        (function (path) {
          receiver.files.removeIf(function (fileEntry) {
            if (fileEntry.path == path || 0 == fileEntry.path.indexOf(path + pathSeparator)) {
              removeFileElement(fileEntry.path);
              return true;
            }
          });
        })(inputPath);
      } else {
        if (receiver.findElemFromPath(inputPath).length) {
          receiver.removeItemFromView({ path: inputPath }, false, immediate);
        } else {
          (function (path) {
            Object.keys(receiver.dirMap)
              .clone()
              .forEach(function (item) {
                if (!(item != path && 0 != item.indexOf(path + pathSeparator))) {
                  receiver.dirMap[item].content.forEach(function (inputItem) {
                    removeFileElement(inputItem.path);
                  });
                  delete receiver.dirMap[item];
                }
              });
            receiver.dirArr.removeIf(function (folderGroup) {
              return (
                folderGroup.path == path || 0 == folderGroup.path.indexOf(path + pathSeparator)
              );
            });
          })(inputPath);
        }
      }
    }
    removeItemFromView(fileEntry, keepElement, immediate) {
      function removeMatchingEntry(entries, searchValue) {
        if (~entries.indexOf(searchValue)) {
          entries.remove(searchValue);
        } else {
          entries.removeIf(function (fileEntry) {
            return utilities.isSamePath(fileEntry.path, searchValue.oldPath || searchValue.path);
          }, true);
        }
      }
      var element = this.findElemFromPath(fileEntry.oldPath || fileEntry.path);
      if (!fileEntry.folderPath) {
        fileEntry.folderPath = element.attr('data-parent-path');
      }
      if (!element.length) {
        return jquery();
      }
      if (this.noGroup) {
        removeMatchingEntry(this.files, fileEntry);
      } else {
        var folderGroup = this.dirMap[fileEntry.folderPath];
        if (folderGroup) {
          removeMatchingEntry(folderGroup.content, fileEntry);
        }
      }
      if (!keepElement) {
        if (immediate) {
          element.remove();
        } else {
          element.addClass('marklyra-to-remove');
          element.hide(400, function () {
            element.remove();
          });
        }
      }
      return element;
    }
    appendItemToViewByMac(serializedEntry, legacyAppendFlag, forceMark) {
      this.appendItemToView(JSON.parse(serializedEntry), legacyAppendFlag, void 0, {
        forceMark: forceMark,
      });
    }
    bindEvents() {
      var receiver = this;
      currentElement.on('mousedown', '.file-list-item', function (unusedParameter1) {
        if ('INPUT' == document.activeElement.tagName) {
          var containedFocus = this.contains(document.activeElement);
          jquery(document.activeElement).trigger('blur');
          if (containedFocus) {
            return;
          }
        }
        if (1 == event.which) {
          if (event.ctrlKey || event.metaKey) {
            receiver.parent.openFileInNewWindowCommand(this);
          } else {
            jquery('.file-list-item:focus').blur();
            receiver.parent.openFile(this.getAttribute('data-path'));
          }
          return false;
        }
      });
      var dragDepth = 0;
      jquery('#file-library')
        .on('dragenter', function (inputEvent) {
          if (!receiver.parent.useTreeStyle) {
            if ((inputEvent.originalEvent.dataTransfer.types || []).indexOf('Files') > -1) {
              inputEvent.preventDefault();
              inputEvent.stopPropagation();
              if (!dragDepth) {
                document.querySelector('#sidebar-content').classList.add('on-drop');
              }
            }
            dragDepth++;
          }
        })
        .on('dragover', function (inputEvent) {
          inputEvent.preventDefault();
          inputEvent.stopPropagation();
        })
        .on('dragleave', function (unusedParameter1) {
          if (!(receiver.parent.useTreeStyle || --dragDepth)) {
            document.querySelector('#sidebar-content').classList.remove('on-drop');
          }
        })
        .on('drop', function (inputEvent) {
          if (!receiver.parent.useTreeStyle && File.getMountFolder() && File.isActiveWindow()) {
            document.querySelector('#sidebar-content').classList.remove('on-drop');
            dragDepth = 0;
            inputEvent.stopPropagation();
            inputEvent.preventDefault();
            var dataTransfer = inputEvent.originalEvent.dataTransfer,
              items = [];
            if (
              dataTransfer.files.length &&
              !mediaActions.getPathForFile(dataTransfer.files.item(0))
            ) {
              items = receiver.parent.filesInDragging || [];
            } else {
              for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                var droppedPath = mediaActions.getPathForFile(dataTransfer.files.item(fileIndex));
                if (droppedPath) {
                  items.push(droppedPath);
                }
              }
            }
            receiver.parent.copyOrMoveFiles(items, File.getMountFolder());
          }
        })
        .on('click', '#switch-to-tree-on-oversize', function () {
          receiver.parent.switch('file-tree');
        });
    }
    needRepaint(forceReset) {
      if (forceReset || true !== renderState) {
        renderState = false;
        this.dirArr = [];
        this.dirMap = {};
        this.files = [];
      }
    }
    findNodeFromPath(filePath) {
      if (this.noGroup) {
        return this.files.find((item) => utilities.isSamePath(filePath, item.path));
      }
      for (var fileEntry of this.dirArr) {
        if (utilities.isSamePath(filePath, fileEntry.path)) {
          return fileEntry;
        }
        var elements = fileEntry.content.find((item) => utilities.isSamePath(filePath, item.path));
        if (elements) {
          return elements;
        }
      }
    }
    findElemFromPath(path, exactPath) {
      if ((path = exactPath ? path : (this.findNodeFromPath(path) || {}).path || path)) {
        return jquery(".file-list-item[data-path='" + utilities.escapeSelector(path) + "']");
      } else {
        return jquery();
      }
    }
    onAddFile(fileEntry) {
      return this.appendItemToView(fileEntry, true);
    }
    onChangeForMac(changes) {
      if ('complete' == renderState && !this.parent.isSuppressOnChange()) {
        for (
          var visitedPaths = [],
            needsRefresh = false,
            renamingPath = jquery('input.file-list-item-file-name')
              .closest('.file-list-item')
              .attr('data-path'),
            itemIndex = 0;
          itemIndex < changes.length;
          itemIndex++
        ) {
          var change = changes[itemIndex];
          if ((change.oldPath || change.path) == renamingPath) {
            return;
          }
          if (
            DocumentNode.isType(change.type, 'created', 'modified') &&
            trackUniquePath(change.path, visitedPaths)
          ) {
            return;
          }
          console.debug(change);
          if (!this.parent.shouldIgnore(change.path || change.newPath)) {
            if ('rename' == change.type) {
              if (change.isDir) {
                needsRefresh = true;
                break;
              }
              var wasCurrentFile = fileIntegration.getCurrentFilePath() == change.oldPath;
              this.removeFileOrFolder(change.oldPath);
              bridge.callHandler('library.updateListItem', {
                path: change.newPath,
                mark: wasCurrentFile || false,
              });
            } else {
              if ('removed' == change.type) {
                this.removeFileOrFolder(change.path);
              }
            }
            if (change.isDir && 'modified' != change.type) {
              needsRefresh = true;
              break;
            }
            if ('created' == change.type) {
              if (!(!change.isDir && /~\.[^.]+$/.exec(change.path))) {
                bridge.callHandler('library.updateListItem', { path: change.path, mark: false });
              }
            } else {
              if (!('modified' != change.type || change.isDir)) {
                if ('oversize' != renderState) {
                  bridge.callHandler('library.updateListItemIfIsOpen', change.path);
                }
              }
            }
          }
        }
        if (!renderState && needsRefresh && this.isShown()) {
          var scrollOffset = jquery('#file-library').scrollTop();
          this.render(true);
          setTimeout(function () {
            jquery('#file-library').scrollTop(scrollOffset);
          }, 0);
        }
      }
    }
    onChangeForWin(changedPath, contentOnly, items) {
      if ('complete' == renderState && !this.parent.isSuppressOnChange()) {
        var receiver = this;
        if (!this.parent.shouldIgnore(changedPath)) {
          if (
            changedPath !=
            jquery('input.file-list-item-file-name').closest('.file-list-item').attr('data-path')
          ) {
            if (contentOnly) {
              (function (filePath) {
                if (!trackUniquePath(filePath, items, true)) {
                  if (0 != receiver.findElemFromPath(filePath).length) {
                    statWrapper(filePath, function (fileInfo) {
                      if (fileInfo && !fileInfo.shouldIgnore && fileInfo.isFile) {
                        var fileEntry = receiver.getItem(filePath);
                        if (!fileEntry) {
                          return;
                        }
                        receiver.fetchSummaryByNode(filePath, fileInfo, function (summary) {
                          fileEntry.summary = summary;
                          fileEntry.lastModified = fileInfo.mtime;
                          fileEntry.createDate = fileInfo.birthtime;
                          receiver.appendItemToView(fileEntry, true);
                        });
                        items.push(filePath);
                      }
                    });
                  }
                }
              })(changedPath);
            } else {
              (function (filePath) {
                if (File.getMountFolder() && 0 == filePath.indexOf(File.getMountFolder())) {
                  statWrapper(filePath, function (fileInfo) {
                    if (fileInfo && !fileInfo.shouldIgnore) {
                      if (!trackUniquePath(filePath, items)) {
                        (function (path, fileInfo) {
                          if (fileInfo.isFile) {
                            var folderPath = utilities.pathByDeleteLastComponent(path),
                              fileEntry = {
                                folderPath: folderPath,
                                folderName: fileIntegration.getFileNameFromPath(folderPath),
                                name: fileIntegration.getFileNameFromPath(path),
                                path: path,
                              };
                            receiver.fetchSummaryByNode(path, fileInfo, function (summary) {
                              fileEntry.summary = summary;
                              fileEntry.lastModified = fileInfo.mtime;
                              fileEntry.createDate = fileInfo.birthtime;
                              receiver.appendItemToView(fileEntry, true);
                            });
                          } else {
                            if (fileInfo.isDir) {
                              receiver.appendTreeByNode(path);
                            }
                          }
                        })(filePath, fileInfo);
                      }
                    } else {
                      receiver.removeFileOrFolder(filePath);
                    }
                  });
                }
              })(changedPath);
            }
          }
        }
      }
    }
    update(filePath, text) {
      if (void 0 !== text) {
        var summaryElement = this.parent
          .findElemFromPath(filePath)
          .children('.file-list-item-summary');
        summaryElement.text(buildFilePreview(text.substr(0, 500)));
        summaryElement.html(summaryElement.html().replace(/([^\s]+)\s*\n+/g, '$1<br/>'));
      }
    }
    highlight(filePath) {
      var element = this.focusToFile(filePath, true);
      if (element) {
        element.classList.add('blink-area');
        setTimeout(function () {
          element.classList.remove('blink-area');
          this.parent.nextChangeHighlight = null;
        }, 2e3);
      }
    }
    focusToFile(filePath, immediate) {
      var itemElement = this.findElemFromPath(filePath)[0];
      if (itemElement) {
        var itemTop = itemElement ? itemElement.offsetTop : 0,
          clientHeight = itemElement.clientHeight,
          scrollTarget = itemElement ? { scrollTop: Math.max(0, itemTop - clientHeight) } : null,
          scrollContainer = jquery(File.isMac ? '.sidebar-content' : '#file-library'),
          viewportHeight = scrollContainer.parent().height();
        if (
          !(
            !scrollTarget ||
            (scrollContainer.scrollTop() < itemTop + 40 &&
              viewportHeight + scrollContainer.scrollTop() > itemTop + 40)
          )
        ) {
          if (immediate) {
            scrollContainer.finish().scrollTop(scrollTarget.scrollTop);
          } else {
            scrollContainer.animate(scrollTarget, 500);
          }
        }
        return itemElement;
      }
    }
    newFile() {
      var folderPath,
        untitledIndex,
        receiver = this;
      function appendCreatedFile(path, name) {
        var newElement = this.appendItemToView(
          {
            folderPath: File.getMountFolder(),
            folderName: fileIntegration.getFileNameFromPath(File.getMountFolder()),
            name: name,
            path: path,
            lastModified: new Date(),
            createDate: new Date(),
            summary: '',
          },
          true,
        );
        if (receiver.parent.isDiscardableUntitled()) {
          receiver.parent.openFile(path);
          return void setTimeout(function () {
            receiver.renameFileCommand(newElement, true);
          }, 100);
        }
        receiver.renameFileCommand(newElement, true);
      }
      if (File.getMountFolder()) {
        if (showFolderNames) {
          if (File.isMac) {
            bridge.callHandler('library.newFileUnder', File.getMountFolder());
          } else {
            File.FileSave.doShowSaveDialog(
              false,
              File.getMountFolder() + '/Untitled.' + File.FileOption.getDefaultExtension(),
              {
                title: 'New',
                buttonLabel: 'Create',
                properties: ['showOverwriteConfirmation'],
              },
            ).then(async ({ filePath: selectedPath }) => {
              if (selectedPath) {
                receiver.parent.scheduleChangeHighlight(selectedPath);
                if (File.bundle.filePath) {
                  await File.FileSave.saveUseNode(false, false, true);
                  await File.FileSave.makeEmptyFileByNode(selectedPath);
                } else {
                  await File.FileSave.saveAsUseNode(selectedPath);
                }
                receiver.parent.openFile(selectedPath);
              }
            });
          }
        } else {
          var newFileName =
              ((folderPath = File.getMountFolder()),
              (untitledIndex = 0),
              jquery(
                ".file-list-item[data-parent-path='" + utilities.escapeSelector(folderPath) + "']",
              ).each(function () {
                var match = /^untitled( (\d+))?\./i.exec(
                  this.querySelector('.file-list-item-file-name').textContent.trim(),
                );
                if (match) {
                  untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1);
                }
              }),
              'Untitled' +
                (untitledIndex ? ' ' + untitledIndex : '') +
                '.' +
                File.FileOption.getDefaultExtension()),
            newFilePath = File.getMountFolder() + (File.isWin ? '\\' : '/') + newFileName;
          receiver = this;
          this.parent.pauseOnChange(true);
          if (File.isMac) {
            this.parent.pauseOnChange(true);
            bridge.callHandler('library.newFile', newFilePath, function (created) {
              if (created) {
                appendCreatedFile.call(receiver, newFilePath, newFileName);
              } else {
                receiver.parent.resumeOnChange();
                bridge.callHandler('library.newFileUnder', File.getMountFolder());
              }
            });
          } else {
            var fileSystem = reqnode('fs');
            newFilePath = reqnode('path').resolve(newFilePath);
            var fileDescriptor = fileSystem.openSync(newFilePath, 'wx');
            fileSystem.close(fileDescriptor, function () {});
            this.parent.pauseOnChange(true);
            appendCreatedFile.call(this, newFilePath, newFileName);
          }
        }
      }
    }
    onFileUpdated(path, updatedFields) {
      var fileEntry = this.findNodeFromPath(path);
      if (fileEntry) {
        if (updatedFields) {
          Object.assign(fileEntry, updatedFields);
        }
        fileEntry.lastModified = new Date();
        var element = this.findElemFromPath(fileEntry.path, true);
        if (element.length) {
          this.appendItemToView(
            {
              path: path,
              folderPath: element.attr('data-parent-path'),
              folderName: element.children('.file-list-item-parent-loc').text(),
              lastModified: fileEntry.lastModified,
              createDate: fileEntry.createDate,
              name: fileIntegration.getFileNameFromPath(path),
              summary: fileEntry.summary,
              oldPath: path,
            },
            true,
          );
        }
      }
    }
    newFileCommand(unusedParameter1) {
      this.newFile();
    }
    renameFileCommand(element, newlyCreated) {
      element = jquery(element).closest('.file-library-node')[0];
      if (File.isMac) {
        bridge.callHandler('window.focus');
      }
      var receiver = this,
        renameInput = jquery("<input class='file-list-item-file-name' />"),
        elements = jquery(element).find('.file-list-item-file-name'),
        labelElement = elements.clone(),
        attributeValue = element.getAttribute('data-path'),
        previousName = elements.children().text();
      function applyRenamedFileLabel(name, path) {
        path = path.trim();
        name = name.trim();
        updateFileNameLabel(labelElement, name);
        renameInput.replaceWith(labelElement);
        if (attributeValue != path) {
          var itemElement = jquery(element);
          receiver.appendItemToView(
            {
              path: path,
              folderPath: element.getAttribute('data-parent-path'),
              folderName: jquery(element).children('.file-list-item-parent-loc').text(),
              lastModified: new Date(),
              createDate: new Date(element.dataset.createDate - 0),
              name: name,
              summary:
                ((summaryElement = itemElement.children('.file-list-item-summary')),
                summaryElement.length
                  ? summaryElement[0].textContent || summaryElement[0].innerText
                  : ''),
              oldPath: attributeValue,
            },
            true,
          );
        }
        var summaryElement;
        receiver.editor.restoreLastCursor();
      }
      elements.replaceWith(renameInput);
      renameInput.val(previousName);
      this.parent.bindRename(
        renameInput,
        function (inputElement) {
          if (File.isMac) {
            return (function (inputElement) {
              var nextName = inputElement.val().replace(/[\/\\]/g, ''),
                newValue = utilities.pathByDeleteLastComponent(attributeValue) + '/' + nextName;
              receiver.parent.pauseOnChange(true);
              if (attributeValue != newValue) {
                bridge.callHandler(
                  'library.renameFile',
                  { old: attributeValue, new: newValue },
                  function (renamed) {
                    if (renamed) {
                      applyRenamedFileLabel(nextName, newValue);
                      if (attributeValue == fileIntegration.getCurrentFilePath()) {
                        console.debug('update marked file');
                        setTimeout(function () {
                          receiver.parent.markOpenedFile(newValue);
                          receiver.focusToFile(newValue, true);
                        }, 200);
                      }
                      receiver.highlight(newValue);
                    } else {
                      applyRenamedFileLabel(previousName, attributeValue);
                    }
                  },
                );
              } else {
                applyRenamedFileLabel(previousName, attributeValue);
              }
            })(inputElement);
          } else {
            return (function (inputElement) {
              var text = inputElement.val();
              if (
                (text = (
                  File.isWin
                    ? text.replace(/[\\\/:*?"<>\|\000-\031]/g, '').replace(/\.+$/, '')
                    : text.replace(/[\/\\\000-\031]/g, '')
                ).trim())
              ) {
                var nextPath = reqnode('path').resolve(
                    utilities.pathByDeleteLastComponent(attributeValue) +
                      (File.isWin ? '\\' : '/') +
                      text,
                  ),
                  fileSystem = reqnode('fs');
                if (attributeValue != nextPath) {
                  if (
                    utilities.isSamePath(attributeValue, nextPath) ||
                    !fileSystem.existsSync(nextPath)
                  ) {
                    receiver.parent.pauseOnChange(true);
                    JSBridge.invoke('app.sendEvent', 'willRename', {
                      oldPath: attributeValue,
                    });
                    receiver.parent.execRenameFileByNode(attributeValue, nextPath).then(function ([
                      renameError,
                    ]) {
                      JSBridge.invoke('app.sendEvent', 'didRename', {
                        oldPath: attributeValue,
                        newPath: renameError ? attributeValue : nextPath,
                      });
                      if (renameError) {
                        restoreNameAfterRenameFailure(renameError);
                      } else {
                        if (!newlyCreated) {
                          JSBridge.invoke(
                            'filesOp.registerUndo',
                            nextPath,
                            attributeValue,
                            jquery.localize
                              .getString('Rename %@', 'Panel')
                              .replace('%@', reqnode('path').basename(attributeValue)),
                          );
                        }
                        applyRenamedFileLabel(text, nextPath);
                        receiver.highlight(nextPath);
                      }
                    });
                  } else {
                    restoreNameAfterRenameFailure(
                      jquery.localize.getString(
                        'File with same name already exists at target path.',
                      ),
                    );
                  }
                } else {
                  applyRenamedFileLabel(previousName, attributeValue);
                }
              } else {
                applyRenamedFileLabel(previousName, attributeValue);
              }
              function restoreNameAfterRenameFailure(errorMessage) {
                applyRenamedFileLabel(previousName, attributeValue);
                dialogs.showErrorDialog(
                  jquery.localize.getString('Operation Failed'),
                  jquery.localize
                    .getString('Failed to rename from "{0}" to "{1}"')
                    .format(previousName, text) +
                    '\n' +
                    errorMessage,
                );
                console.debug(errorMessage);
              }
            })(inputElement);
          }
        },
        function () {
          applyRenamedFileLabel(previousName, attributeValue);
        },
        false,
        newlyCreated,
        true,
        utilities.pathByDeleteLastComponent(attributeValue),
      );
      renameInput.focus();
    }
  };
}
