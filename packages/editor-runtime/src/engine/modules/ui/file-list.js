// ui/file-list.
// SystemJS module 51. Dependencies: 11, 13, 33, 35, 27, 29, 2a, e.
$__System.registerDynamic(
  '51',
  ['11', '13', '33', '35', '27', '29', '2a', 'e'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var renderState,
      dateInstance,
      showFolderNames,
      timerId,
      utilities = requireModule('11'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      fileIntegration = (documentModel.TYPE, requireModule('33')),
      dialogs =
        (requireModule('35'),
        (utilities = requireModule('11')),
        requireModule('27').map,
        requireModule('29')),
      mediaActions = requireModule('2a'),
      jquery = requireModule('e'),
      currentElement = jquery('#file-library-list-children'),
      localElement = jquery('#file-library-list'),
      g = function (text) {
        return File.option.strictMarkdown
          ? text
              .replace(/^\s*(([\n>]+)|([-=*`\s]{3,}))/gm, '')
              .replace(/^\s*#+\s+/gm, '')
              .replace(/\s*[*_`$=]+\s*/gm, ' ')
              .replace(/\[([^\]]+)\]\([^)]*\)/gm, '$1')
          : text
              .replace(/^\s*(([\n#>]+)|([-=*`\s]{3,}))/gm, '')
              .replace(/\s*[*_`$=]+\s*/gm, ' ')
              .replace(/\[([^\]]+)\]\([^)]*\)/gm, '$1');
      },
      v = function (metadataLines, startLine, metadataValue, lineLimit) {
        for (var itemIndex = startLine + 1; itemIndex < lineLimit; itemIndex++) {
          if (metadataLines[itemIndex].indexOf(':') >= 0) return metadataValue;
          metadataValue += '\n' + metadataLines[itemIndex];
        }
        return metadataValue;
      },
      y = function (itemElement, text) {
        var substringLength = text.lastIndexOf('.');
        substringLength < 0 && (substringLength = text.length),
          itemElement.find('.file-list-item-file-name-part').text(text.substr(0, substringLength)),
          itemElement.find('.file-list-item-file-ext-part').text(text.substr(substringLength));
      },
      b = function (text, unusedParameter2) {
        var match,
          parts = text.split(/\r*\n+/),
          partsLength = parts.length;
        if ('---' == parts[0]) {
          for (
            var currentText, textParts = [], itemIndex = 1;
            itemIndex < partsLength;
            itemIndex++
          ) {
            if ('---' == parts[itemIndex])
              return (
                textParts.length < 3 &&
                  textParts.push(g(parts.slice(itemIndex + 1).join('\n') || text)),
                textParts.join('\n')
              );
            (match = /^\s*(title)\s*:(.+)$/.exec(parts[itemIndex]))
              ? (currentText = v(parts, itemIndex, match[2], partsLength)) &&
                textParts.push(currentText.trim())
              : (match = /^\s*(subtitle)\s*:(.+)$/.exec(parts[itemIndex]))
                ? (currentText = v(parts, itemIndex, match[2], partsLength)) &&
                  textParts.push(currentText.trim())
                : (match = /^\s*(overview|summary|description|excerpt)\s*:(.+)$/.exec(
                    parts[itemIndex],
                  )) &&
                  (currentText = v(parts, itemIndex, match[2], partsLength)) &&
                  textParts.push(currentText.trim());
          }
          return g(text);
        }
        return g(text);
      },
      statWrapper = fileIntegration.statWrapper;
    function x(filePath, items, checkOnly) {
      var pathSeparator = File.isWin ? '\\' : '/';
      if (
        items.find(function (item) {
          return item == filePath || 0 == filePath.indexOf(item + pathSeparator);
        })
      )
        return !0;
      !checkOnly && items.push(filePath);
    }
    var fetchLimit = 400;
    moduleRecord.exports = class {
      constructor(parent) {
        (this.parent = parent),
          (this.editor = parent.editor),
          (this.$template = jquery(document.querySelector('#file-list-item-template').textContent)),
          (this.noGroup = File.option.listNoGroup || !1),
          (this.sortType = File.option.listSortType),
          this.setGroupByFolder(this.noGroup),
          this.registerBridge(),
          this.needRepaint(),
          File.isNode &&
            ((fetchLimit = Number.parseInt(File.option.maxFetchCountOnFileList) || 200),
            Number.isNaN(fetchLimit) && (fetchLimit = 200)),
          console.debug('MAX_FETCH_COUNT on FileList: ' + fetchLimit);
      }
      registerBridge() {
        if (File.isMac) {
          var receiver = this;
          bridge.registerHandler('fileList.renderAll', function (renderPayload, reply) {
            if ('oversize' != renderState) {
              var fragment = document.createDocumentFragment();
              renderPayload[0].forEach(function (item) {
                receiver.appendItemToView(item, !1, fragment);
              }),
                currentElement.html(''),
                currentElement.append(fragment),
                receiver.endRender(renderPayload[1], renderPayload[2], renderPayload[2]),
                reply && reply(null);
            }
          }),
            bridge.registerHandler('fileList.appendItem', function (itemPayload, reply) {
              receiver.appendItemToView(itemPayload[0], itemPayload[1], void 0, {
                forceMark: itemPayload[2],
              }),
                reply && reply(null);
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
          (this.render(), File.isNode && this.parent.addWatch(File.getMountFolder()), !0)
        );
      }
      appendTreeByNode(rootPath, t, fetchedCount, element) {
        var fileSystemPlus = reqnode('fs-plus'),
          pathUtilities = reqnode('path'),
          receiver = this,
          useFsQueue = File.option.useFsQueue;
        (fetchedCount = fetchedCount || 0), (t = t || function () {});
        var hasTargetContainer = !!element;
        element = element || localElement;
        var items = [],
          pendingIo = 0,
          p = function () {
            items = [];
          },
          f = function () {
            if ('oversize' != renderState)
              for (var batchCount = 0; batchCount < 20 && items.length; ) {
                batchCount++;
                var queuedTask = items.shift();
                queuedTask[1] ? g(queuedTask[0], queuedTask[2]) : v(queuedTask[0], queuedTask[2]);
              }
            else p();
          },
          g = function (directoryPath, onRead) {
            pendingIo++,
              fileSystemPlus.readdir(directoryPath, function (error, fileNames) {
                pendingIo--, useFsQueue && pendingIo < 50 && f(), onRead(error, fileNames);
              });
          },
          v = function (filePath, onStat) {
            pendingIo++,
              statWrapper(filePath, function (fileInfo) {
                pendingIo--, useFsQueue && pendingIo < 50 && f(), onStat(fileInfo);
              });
          },
          y = function (separator, onFile, onDirectory, onComplete) {
            if (!separator) return onComplete();
            !(function (directoryPath, onRead) {
              useFsQueue && pendingIo >= 50
                ? items.push([directoryPath, !0, onRead])
                : g(directoryPath, onRead);
            })(separator, function (readError, inputItems) {
              if (readError) return onComplete(void 0, readError);
              var itemsLength = inputItems.length;
              itemsLength || onComplete();
              var g = function () {
                --itemsLength <= 0 && onComplete();
              };
              inputItems.forEach(function (item) {
                var entryPath = pathUtilities.join(separator, item);
                !(function (filePath, onStat) {
                  useFsQueue && pendingIo >= 50
                    ? items.push([filePath, !1, onStat])
                    : v(filePath, onStat);
                })(entryPath, function (fileInfo) {
                  if (renderState) {
                    if (!fileInfo || fileInfo.shouldIgnore) return g();
                    if (
                      (50 == fetchedCount &&
                        !0 === renderState &&
                        'rendering' != element.attr('data-state') &&
                        element.attr('data-state', 'rendering'),
                      fetchedCount > fetchLimit)
                    )
                      return p(), void receiver.endRender(!0);
                    fileInfo.isFile
                      ? onFile(fileInfo, item, separator, entryPath, g) && fetchedCount++
                      : fileInfo.isDir && onDirectory(fileInfo, item, separator, entryPath)
                        ? y(entryPath, onFile, onDirectory, g)
                        : g();
                  }
                });
              });
            });
          };
        y(
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
              return (
                receiver.fetchSummaryByNode(path, fileInfo, function (summary) {
                  (fileEntry.summary = summary),
                    receiver.appendItemToView(
                      fileEntry,
                      !1,
                      hasTargetContainer ? element[0] : void 0,
                    ),
                    onComplete();
                }),
                !0
              );
            }
            onComplete();
          },
          function (fileInfo, unusedParameter2, unusedParameter3, directoryPath) {
            return !fileInfo.shouldIgnore && (receiver.parent.addWatchByUnix(directoryPath), !0);
          },
          t,
        );
      }
      fetchAllDocsByNode() {
        var receiver = this;
        this.parent.calcMountFolder(!0).then(function (result) {
          receiver.appendTreeByNode(result || '', receiver.endRender.bind(receiver));
        });
      }
      fetchSummaryByNode(textFile, fileInfo, onSummary) {
        var summaryText,
          fileSystemPlus = reqnode('fs-plus');
        fileInfo.isBundle
          ? (textFile = fileInfo.textFile)
          : /\.textpack$/.exec(textFile) && onSummary(''),
          fileSystemPlus
            .createReadStream(textFile, { start: 0, end: 600 })
            .on('data', function (contentChunk) {
              if ('string' == typeof contentChunk) summaryText = contentChunk;
              else {
                var text = fileIntegration.detectEncodeByNode(contentChunk),
                  decodedText = fileIntegration.getContentFromBuffer(
                    contentChunk,
                    text.replace('-bom', ''),
                    !0,
                  );
                summaryText = decodedText;
              }
            })
            .on('end', function () {
              void 0 === summaryText && (summaryText = ''), onSummary(summaryText);
            });
      }
      render(forceRefresh) {
        if ((forceRefresh && this.needRepaint(), !renderState)) {
          (renderState = !0), (dateInstance = new Date()), (showFolderNames = !1);
          var receiver = this;
          setTimeout(function () {
            !0 === renderState &&
              'rendering' != localElement.attr('data-state') &&
              localElement.attr('data-state', 'rendering');
          }, 500),
            currentElement.html('').removeClass('show-folder-name'),
            File.isMac
              ? this.parent.calcMountFolder(!0).then(function (result) {
                  bridge.callHandler('library.fetchAllDocs', result || '');
                })
              : File.isNode && this.fetchAllDocsByNode(),
            setTimeout(function () {
              !0 === renderState &&
                new Date() - dateInstance > 8e3 &&
                (console.warn('render file list timeout'), receiver.endRender(!0));
            }, 1e4);
        }
      }
      endRender(oversize, loadFailed, unusedParameter3) {
        if ('oversize' != renderState || !oversize) {
          if (
            ((renderState = oversize ? 'oversize' : 'complete'),
            jquery('#file-library-list').attr('data-state', renderState),
            timerId && clearTimeout(timerId),
            (timerId = setTimeout(function () {
              'oversize' == renderState &&
                jquery('#file-library-list').attr('data-state', 'oversize-end');
            }, 2e3)),
            !oversize)
          ) {
            if (loadFailed && File.getMountFolder()) return void this.parent.onLoadFolderFailed();
            this.parent.markCurrentFile(!1);
          }
          this.parent.silent = !1;
        }
      }
      setSortType(sortType) {
        if (
          ((this.sortType = sortType),
          JSBridge.putSetting('listSortType', sortType),
          'complete' === renderState)
        ) {
          currentElement.html('');
          var fragment = document.createDocumentFragment();
          this.noGroup
            ? (this.files.sort(this.parent.compareItem.bind(this.parent)),
              this.files.forEach(function (item) {
                this.appendItemToView(item, !1, fragment);
              }, this))
            : this.dirArr.forEach(function (item) {
                var content = item.content;
                (item.content = []),
                  content.forEach(function (inputItem) {
                    this.appendItemToView(inputItem, !1, fragment);
                  }, this);
              }, this),
            currentElement.append(fragment);
        }
      }
      setGroupByFolder(noGroup) {
        if (
          (noGroup
            ? jquery('#marklyra-group-by-folder-btn').removeClass('active')
            : jquery('#marklyra-group-by-folder-btn').addClass('active'),
          'complete' === renderState && this.noGroup != noGroup)
        ) {
          (this.noGroup = noGroup),
            JSBridge.putSetting('listNoGroup', noGroup),
            currentElement.html('');
          var fragment = document.createDocumentFragment();
          noGroup
            ? ((this.files = []),
              this.dirArr.forEach(function (item) {
                this.files = this.files.concat(item.content);
              }, this),
              (this.dirArr = []),
              (this.dirMap = {}),
              this.files.sort(this.parent.compareItem.bind(this.parent)),
              this.files.forEach(function (item) {
                this.appendItemToView(item, !1, fragment);
              }, this))
            : ((this.dirArr = []),
              (this.dirMap = {}),
              this.files.forEach(function (item) {
                this.appendItemToView(item, !1, fragment);
              }, this),
              (this.files = [])),
            currentElement.append(fragment),
            'oversize' == renderState
              ? this.endRender(!0)
              : 'complete' == renderState && this.endRender(!1);
        }
      }
      getItem(path) {
        if (this.noGroup)
          for (
            var filesLength = this.files.length, itemIndex = 0;
            itemIndex < filesLength;
            itemIndex++
          ) {
            if (this.files[itemIndex].path == path) return this.files[itemIndex];
            if (this.files[itemIndex].folderPath == path) return { path: path, isDir: !0 };
          }
        else {
          if (this.dirMap[path]) return { path: path, isDir: !0 };
          var parentPath = utilities.pathByDeleteLastComponent(path);
          if (this.dirMap[parentPath])
            return this.dirMap[parentPath].content.find(function (item) {
              return item.path == path;
            });
        }
      }
      getIndexOnView(listElement, viewIndex) {
        for (var itemIndex = 0; itemIndex < listElement.children.length; itemIndex++) {
          if (itemIndex >= viewIndex) return viewIndex;
          listElement.children[itemIndex].classList.contains('marklyra-to-remove') && viewIndex++;
        }
        return viewIndex;
      }
      computeIndex(fileEntry) {
        return (
          this.noGroup
            ? function (searchValue) {
                var insertionIndex = this.files.indexOf(searchValue);
                if (insertionIndex > -1) return insertionIndex;
                insertionIndex = 0;
                for (
                  var itemIndex = 0;
                  itemIndex < this.files.length &&
                  !(this.parent.compareItem(this.files[itemIndex], searchValue) > 0);
                  itemIndex++
                )
                  insertionIndex++;
                return this.files.splice(insertionIndex, 0, searchValue), insertionIndex;
              }
            : function (fileEntry) {
                var folderPath = fileEntry.folderPath,
                  folderGroup = this.dirMap[folderPath],
                  precedingCount = 0,
                  groupIndex = 0;
                folderGroup ||
                  ((folderGroup = { path: folderPath, content: [] }),
                  this.dirArr.push(folderGroup),
                  (this.dirMap[folderPath] = folderGroup));
                for (var itemIndex = 0; itemIndex < this.dirArr.length - 1; itemIndex++) {
                  var precedingGroup = this.dirArr[itemIndex];
                  if (precedingGroup.path == folderPath) break;
                  precedingCount += precedingGroup.content.length;
                }
                for (
                  itemIndex = 0;
                  itemIndex < folderGroup.content.length &&
                  !(this.parent.compareItem(folderGroup.content[itemIndex], fileEntry) > 0);
                  itemIndex++
                )
                  groupIndex++;
                return (
                  folderGroup.content.splice(groupIndex, 0, fileEntry), groupIndex + precedingCount
                );
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
            showFolderNames ||
              (File.getMountFolder() != fileEntry.folderPath &&
                ((showFolderNames = !0), currentElement.addClass('show-folder-name'))),
              element
                .attr('data-path', fileEntry.path)
                .attr('data-create-date', fileEntry.createDate - 0)
                .attr('data-parent-path', fileEntry.folderPath),
              element
                .find('.file-list-item-file-name')
                .attr('title', utilities.abbreviatingWithTilde(fileEntry.path)),
              element.children('.file-list-item-parent-loc').text(fileEntry.folderName),
              element
                .children('.file-list-item-time')
                .text(utilities.date2NaturalLang(new Date(fileEntry.lastModified), !0)),
              y(element, fileEntry.name);
            var insertionIndex,
              summaryElement = element.children('.file-list-item-summary');
            if (
              (summaryElement.text(b(fileEntry.summary, fileEntry.name)),
              summaryElement.html(summaryElement.html().replace(/([^\s]+)\s*\n+/g, '$1<br/>')),
              fileEntry.path == fileIntegration.getCurrentFilePath() && element.addClass('active'),
              targetContainer)
            )
              (insertionIndex = this.computeIndex(fileEntry)),
                targetContainer.insertChildAtIndex(element[0], insertionIndex);
            else {
              var clientHeight,
                length,
                previousElement = this.removeItemFromView(fileEntry, !0),
                wasActive = previousElement.hasClass('active');
              if (previousElement && previousElement.length)
                return (
                  (length = previousElement.prevAll().length),
                  (insertionIndex = this.computeIndex(fileEntry)),
                  (insertionIndex = this.getIndexOnView(currentElement[0], insertionIndex)),
                  length != insertionIndex || fileEntry.oldPath
                    ? ((fileEntry.oldPath = void 0),
                      (clientHeight = previousElement[0].clientHeight),
                      previousElement.remove(),
                      currentElement[0].insertChildAtIndex(element[0], insertionIndex),
                      (wasActive || forceMark) && element.addClass('active'),
                      skipAnim ||
                        currentElement.children().each(function (rowIndex) {
                          var currentReceiver = this;
                          if (currentReceiver == element[0])
                            (currentReceiver.style.transition = 'transform 0s'),
                              (currentReceiver.style.transform =
                                'translate(0px, ' + clientHeight * (length - rowIndex) + 'px)');
                          else if (rowIndex >= insertionIndex && rowIndex < length)
                            (currentReceiver.style.transition = 'transform 0s'),
                              (currentReceiver.style.transform =
                                'translate(0px, -' + clientHeight + 'px)');
                          else {
                            if (!(rowIndex >= length && rowIndex < insertionIndex)) return;
                            currentReceiver.style.transform =
                              'translate(0px, ' + clientHeight + 'px)';
                          }
                          requestAnimationFrame(function () {
                            (currentReceiver.style.transform = ''),
                              (currentReceiver.style.transition = 'transform 400ms');
                          });
                        }),
                      fileIntegration.getCurrentFilePath() == fileEntry.path &&
                        this.parent.markCurrentFile(),
                      C(),
                      element[0])
                    : previousElement.find('input').length
                      ? previousElement[0]
                      : (previousElement.replaceWith(element), C(), element[0])
                );
              (insertionIndex = this.computeIndex(fileEntry)),
                (insertionIndex = this.getIndexOnView(currentElement[0], insertionIndex)),
                currentElement[0].insertChildAtIndex(element[0], insertionIndex);
            }
            return C(), element[0];
          }
        }
        function C() {
          var nextChangeHighlight = receiver.parent.nextChangeHighlight;
          nextChangeHighlight &&
            0 == nextChangeHighlight.indexOf(fileEntry.path) &&
            receiver.highlight(nextChangeHighlight);
        }
      }
      removeFileOrFolder(inputPath, immediate) {
        var receiver = this,
          pathSeparator = File.isWin ? '\\' : '/';
        function r(filePath) {
          var element = receiver.findElemFromPath(filePath);
          element.length &&
            (immediate
              ? element.remove()
              : (element.addClass('marklyra-to-remove'),
                element.hide(400, function () {
                  element.remove();
                })));
        }
        receiver.noGroup
          ? (function (path) {
              receiver.files.removeIf(function (fileEntry) {
                if (fileEntry.path == path || 0 == fileEntry.path.indexOf(path + pathSeparator))
                  return r(fileEntry.path), !0;
              });
            })(inputPath)
          : receiver.findElemFromPath(inputPath).length
            ? receiver.removeItemFromView({ path: inputPath }, !1, immediate)
            : (function (path) {
                Object.keys(receiver.dirMap)
                  .clone()
                  .forEach(function (item) {
                    (item != path && 0 != item.indexOf(path + pathSeparator)) ||
                      (receiver.dirMap[item].content.forEach(function (inputItem) {
                        r(inputItem.path);
                      }),
                      delete receiver.dirMap[item]);
                  }),
                  receiver.dirArr.removeIf(function (folderGroup) {
                    return (
                      folderGroup.path == path ||
                      0 == folderGroup.path.indexOf(path + pathSeparator)
                    );
                  });
              })(inputPath);
      }
      removeItemFromView(fileEntry, keepElement, immediate) {
        function i(entries, searchValue) {
          ~entries.indexOf(searchValue)
            ? entries.remove(searchValue)
            : entries.removeIf(function (fileEntry) {
                return utilities.isSamePath(
                  fileEntry.path,
                  searchValue.oldPath || searchValue.path,
                );
              }, !0);
        }
        var element = this.findElemFromPath(fileEntry.oldPath || fileEntry.path);
        if (
          (fileEntry.folderPath || (fileEntry.folderPath = element.attr('data-parent-path')),
          !element.length)
        )
          return jquery();
        if (this.noGroup) i(this.files, fileEntry);
        else {
          var folderGroup = this.dirMap[fileEntry.folderPath];
          folderGroup && i(folderGroup.content, fileEntry);
        }
        return (
          keepElement ||
            (immediate
              ? element.remove()
              : (element.addClass('marklyra-to-remove'),
                element.hide(400, function () {
                  element.remove();
                }))),
          element
        );
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
            if ((jquery(document.activeElement).trigger('blur'), containedFocus)) return;
          }
          if (1 == event.which)
            return (
              event.ctrlKey || event.metaKey
                ? receiver.parent.openFileInNewWindowCommand(this)
                : (jquery('.file-list-item:focus').blur(),
                  receiver.parent.openFile(this.getAttribute('data-path'))),
              !1
            );
        });
        var dragDepth = 0;
        jquery('#file-library')
          .on('dragenter', function (inputEvent) {
            receiver.parent.useTreeStyle ||
              ((inputEvent.originalEvent.dataTransfer.types || []).indexOf('Files') > -1 &&
                (inputEvent.preventDefault(),
                inputEvent.stopPropagation(),
                dragDepth || document.querySelector('#sidebar-content').classList.add('on-drop')),
              dragDepth++);
          })
          .on('dragover', function (inputEvent) {
            inputEvent.preventDefault(), inputEvent.stopPropagation();
          })
          .on('dragleave', function (unusedParameter1) {
            receiver.parent.useTreeStyle ||
              --dragDepth ||
              document.querySelector('#sidebar-content').classList.remove('on-drop');
          })
          .on('drop', function (inputEvent) {
            if (!receiver.parent.useTreeStyle && File.getMountFolder() && File.isActiveWindow()) {
              document.querySelector('#sidebar-content').classList.remove('on-drop'),
                (dragDepth = 0),
                inputEvent.stopPropagation(),
                inputEvent.preventDefault();
              var dataTransfer = inputEvent.originalEvent.dataTransfer,
                items = [];
              if (
                dataTransfer.files.length &&
                !mediaActions.getPathForFile(dataTransfer.files.item(0))
              )
                items = receiver.parent.filesInDragging || [];
              else
                for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                  var droppedPath = mediaActions.getPathForFile(dataTransfer.files.item(fileIndex));
                  droppedPath && items.push(droppedPath);
                }
              receiver.parent.copyOrMoveFiles(items, File.getMountFolder());
            }
          })
          .on('click', '#switch-to-tree-on-oversize', function () {
            receiver.parent.switch('file-tree');
          });
      }
      needRepaint(forceReset) {
        (forceReset || !0 !== renderState) &&
          ((renderState = !1), (this.dirArr = []), (this.dirMap = {}), (this.files = []));
      }
      findNodeFromPath(filePath) {
        if (this.noGroup)
          return this.files.find((item) => utilities.isSamePath(filePath, item.path));
        for (var fileEntry of this.dirArr) {
          if (utilities.isSamePath(filePath, fileEntry.path)) return fileEntry;
          var elements = fileEntry.content.find((item) =>
            utilities.isSamePath(filePath, item.path),
          );
          if (elements) return elements;
        }
      }
      findElemFromPath(path, exactPath) {
        return (path = exactPath ? path : (this.findNodeFromPath(path) || {}).path || path)
          ? jquery(".file-list-item[data-path='" + utilities.escapeSelector(path) + "']")
          : jquery();
      }
      onAddFile(fileEntry) {
        return this.appendItemToView(fileEntry, !0);
      }
      onChangeForMac(changes) {
        if ('complete' == renderState && !this.parent.isSuppressOnChange()) {
          for (
            var visitedPaths = [],
              needsRefresh = !1,
              renamingPath = jquery('input.file-list-item-file-name')
                .closest('.file-list-item')
                .attr('data-path'),
              itemIndex = 0;
            itemIndex < changes.length;
            itemIndex++
          ) {
            var change = changes[itemIndex];
            if ((change.oldPath || change.path) == renamingPath) return;
            if (
              DocumentNode.isType(change.type, 'created', 'modified') &&
              x(change.path, visitedPaths)
            )
              return;
            if ((console.debug(change), !this.parent.shouldIgnore(change.path || change.newPath))) {
              if ('rename' == change.type) {
                if (change.isDir) {
                  needsRefresh = !0;
                  break;
                }
                var wasCurrentFile = fileIntegration.getCurrentFilePath() == change.oldPath;
                this.removeFileOrFolder(change.oldPath),
                  bridge.callHandler('library.updateListItem', {
                    path: change.newPath,
                    mark: wasCurrentFile || !1,
                  });
              } else 'removed' == change.type && this.removeFileOrFolder(change.path);
              if (change.isDir && 'modified' != change.type) {
                needsRefresh = !0;
                break;
              }
              'created' == change.type
                ? (!change.isDir && /~\.[^.]+$/.exec(change.path)) ||
                  bridge.callHandler('library.updateListItem', { path: change.path, mark: !1 })
                : 'modified' != change.type ||
                  change.isDir ||
                  ('oversize' != renderState &&
                    bridge.callHandler('library.updateListItemIfIsOpen', change.path));
            }
          }
          if (!renderState && needsRefresh && this.isShown()) {
            var scrollOffset = jquery('#file-library').scrollTop();
            this.render(!0),
              setTimeout(function () {
                jquery('#file-library').scrollTop(scrollOffset);
              }, 0);
          }
        }
      }
      onChangeForWin(changedPath, contentOnly, items) {
        if ('complete' == renderState && !this.parent.isSuppressOnChange()) {
          var receiver = this;
          this.parent.shouldIgnore(changedPath) ||
            (changedPath !=
              jquery('input.file-list-item-file-name')
                .closest('.file-list-item')
                .attr('data-path') &&
              (contentOnly
                ? (function (filePath) {
                    x(filePath, items, !0) ||
                      (0 != receiver.findElemFromPath(filePath).length &&
                        statWrapper(filePath, function (fileInfo) {
                          if (fileInfo && !fileInfo.shouldIgnore && fileInfo.isFile) {
                            var fileEntry = receiver.getItem(filePath);
                            if (!fileEntry) return;
                            receiver.fetchSummaryByNode(filePath, fileInfo, function (summary) {
                              (fileEntry.summary = summary),
                                (fileEntry.lastModified = fileInfo.mtime),
                                (fileEntry.createDate = fileInfo.birthtime),
                                receiver.appendItemToView(fileEntry, !0);
                            }),
                              items.push(filePath);
                          }
                        }));
                  })(changedPath)
                : (function (filePath) {
                    File.getMountFolder() &&
                      0 == filePath.indexOf(File.getMountFolder()) &&
                      statWrapper(filePath, function (fileInfo) {
                        fileInfo && !fileInfo.shouldIgnore
                          ? x(filePath, items) ||
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
                                  (fileEntry.summary = summary),
                                    (fileEntry.lastModified = fileInfo.mtime),
                                    (fileEntry.createDate = fileInfo.birthtime),
                                    receiver.appendItemToView(fileEntry, !0);
                                });
                              } else fileInfo.isDir && receiver.appendTreeByNode(path);
                            })(filePath, fileInfo)
                          : receiver.removeFileOrFolder(filePath);
                      });
                  })(changedPath)));
        }
      }
      update(filePath, text) {
        if (void 0 !== text) {
          var summaryElement = this.parent
            .findElemFromPath(filePath)
            .children('.file-list-item-summary');
          summaryElement.text(b(text.substr(0, 500))),
            summaryElement.html(summaryElement.html().replace(/([^\s]+)\s*\n+/g, '$1<br/>'));
        }
      }
      highlight(filePath) {
        var element = this.focusToFile(filePath, !0);
        element &&
          (element.classList.add('blink-area'),
          setTimeout(function () {
            element.classList.remove('blink-area'), (this.parent.nextChangeHighlight = null);
          }, 2e3));
      }
      focusToFile(filePath, immediate) {
        var itemElement = this.findElemFromPath(filePath)[0];
        if (itemElement) {
          var itemTop = itemElement ? itemElement.offsetTop : 0,
            clientHeight = itemElement.clientHeight,
            scrollTarget = itemElement ? { scrollTop: Math.max(0, itemTop - clientHeight) } : null,
            scrollContainer = jquery(File.isMac ? '.sidebar-content' : '#file-library'),
            viewportHeight = scrollContainer.parent().height();
          return (
            !scrollTarget ||
              (scrollContainer.scrollTop() < itemTop + 40 &&
                viewportHeight + scrollContainer.scrollTop() > itemTop + 40) ||
              (immediate
                ? scrollContainer.finish().scrollTop(scrollTarget.scrollTop)
                : scrollContainer.animate(scrollTarget, 500)),
            itemElement
          );
        }
      }
      newFile() {
        var folderPath,
          untitledIndex,
          receiver = this;
        function i(path, name) {
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
            !0,
          );
          if (receiver.parent.isDiscardableUntitled())
            return (
              receiver.parent.openFile(path),
              void setTimeout(function () {
                receiver.renameFileCommand(newElement, !0);
              }, 100)
            );
          receiver.renameFileCommand(newElement, !0);
        }
        if (File.getMountFolder())
          if (showFolderNames)
            File.isMac
              ? bridge.callHandler('library.newFileUnder', File.getMountFolder())
              : File.FileSave.doShowSaveDialog(
                  !1,
                  File.getMountFolder() + '/Untitled.' + File.FileOption.getDefaultExtension(),
                  {
                    title: 'New',
                    buttonLabel: 'Create',
                    properties: ['showOverwriteConfirmation'],
                  },
                ).then(async ({ filePath: selectedPath }) => {
                  selectedPath &&
                    (receiver.parent.scheduleChangeHighlight(selectedPath),
                    File.bundle.filePath
                      ? (await File.FileSave.saveUseNode(!1, !1, !0),
                        await File.FileSave.makeEmptyFileByNode(selectedPath))
                      : await File.FileSave.saveAsUseNode(selectedPath),
                    receiver.parent.openFile(selectedPath));
                });
          else {
            var newFileName =
                ((folderPath = File.getMountFolder()),
                (untitledIndex = 0),
                jquery(
                  ".file-list-item[data-parent-path='" +
                    utilities.escapeSelector(folderPath) +
                    "']",
                ).each(function () {
                  var match = /^untitled( (\d+))?\./i.exec(
                    this.querySelector('.file-list-item-file-name').textContent.trim(),
                  );
                  match && (untitledIndex = Math.max(untitledIndex, (match[2] || 0) - 0 + 1));
                }),
                'Untitled' +
                  (untitledIndex ? ' ' + untitledIndex : '') +
                  '.' +
                  File.FileOption.getDefaultExtension()),
              newFilePath = File.getMountFolder() + (File.isWin ? '\\' : '/') + newFileName;
            if (((receiver = this), this.parent.pauseOnChange(!0), File.isMac))
              this.parent.pauseOnChange(!0),
                bridge.callHandler('library.newFile', newFilePath, function (created) {
                  created
                    ? i.call(receiver, newFilePath, newFileName)
                    : (receiver.parent.resumeOnChange(),
                      bridge.callHandler('library.newFileUnder', File.getMountFolder()));
                });
            else {
              var fileSystem = reqnode('fs');
              newFilePath = reqnode('path').resolve(newFilePath);
              var fileDescriptor = fileSystem.openSync(newFilePath, 'wx');
              fileSystem.close(fileDescriptor, function () {}),
                this.parent.pauseOnChange(!0),
                i.call(this, newFilePath, newFileName);
            }
          }
      }
      onFileUpdated(path, updatedFields) {
        var fileEntry = this.findNodeFromPath(path);
        if (fileEntry) {
          updatedFields && Object.assign(fileEntry, updatedFields),
            (fileEntry.lastModified = new Date());
          var element = this.findElemFromPath(fileEntry.path, !0);
          element.length &&
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
              !0,
            );
        }
      }
      newFileCommand(unusedParameter1) {
        this.newFile();
      }
      renameFileCommand(element, newlyCreated) {
        (element = jquery(element).closest('.file-library-node')[0]),
          File.isMac && bridge.callHandler('window.focus');
        var receiver = this,
          renameInput = jquery("<input class='file-list-item-file-name' />"),
          elements = jquery(element).find('.file-list-item-file-name'),
          labelElement = elements.clone(),
          attributeValue = element.getAttribute('data-path'),
          previousName = elements.children().text();
        function c(name, path) {
          if (
            ((path = path.trim()),
            (name = name.trim()),
            y(labelElement, name),
            renameInput.replaceWith(labelElement),
            attributeValue != path)
          ) {
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
              !0,
            );
          }
          var summaryElement;
          receiver.editor.restoreLastCursor();
        }
        elements.replaceWith(renameInput),
          renameInput.val(previousName),
          this.parent.bindRename(
            renameInput,
            function (inputElement) {
              return File.isMac
                ? (function (inputElement) {
                    var nextName = inputElement.val().replace(/[\/\\]/g, ''),
                      newValue =
                        utilities.pathByDeleteLastComponent(attributeValue) + '/' + nextName;
                    receiver.parent.pauseOnChange(!0),
                      attributeValue != newValue
                        ? bridge.callHandler(
                            'library.renameFile',
                            { old: attributeValue, new: newValue },
                            function (renamed) {
                              renamed
                                ? (c(nextName, newValue),
                                  attributeValue == fileIntegration.getCurrentFilePath() &&
                                    (console.debug('update marked file'),
                                    setTimeout(function () {
                                      receiver.parent.markOpenedFile(newValue),
                                        receiver.focusToFile(newValue, !0);
                                    }, 200)),
                                  receiver.highlight(newValue))
                                : c(previousName, attributeValue);
                            },
                          )
                        : c(previousName, attributeValue);
                  })(inputElement)
                : (function (inputElement) {
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
                      attributeValue != nextPath
                        ? utilities.isSamePath(attributeValue, nextPath) ||
                          !fileSystem.existsSync(nextPath)
                          ? (receiver.parent.pauseOnChange(!0),
                            JSBridge.invoke('app.sendEvent', 'willRename', {
                              oldPath: attributeValue,
                            }),
                            receiver.parent
                              .execRenameFileByNode(attributeValue, nextPath)
                              .then(function ([renameError]) {
                                JSBridge.invoke('app.sendEvent', 'didRename', {
                                  oldPath: attributeValue,
                                  newPath: renameError ? attributeValue : nextPath,
                                }),
                                  renameError
                                    ? d(renameError)
                                    : (newlyCreated ||
                                        JSBridge.invoke(
                                          'filesOp.registerUndo',
                                          nextPath,
                                          attributeValue,
                                          jquery.localize
                                            .getString('Rename %@', 'Panel')
                                            .replace(
                                              '%@',
                                              reqnode('path').basename(attributeValue),
                                            ),
                                        ),
                                      c(text, nextPath),
                                      receiver.highlight(nextPath));
                              }))
                          : d(
                              jquery.localize.getString(
                                'File with same name already exists at target path.',
                              ),
                            )
                        : c(previousName, attributeValue);
                    } else c(previousName, attributeValue);
                    function d(errorMessage) {
                      c(previousName, attributeValue),
                        dialogs.showErrorDialog(
                          jquery.localize.getString('Operation Failed'),
                          jquery.localize
                            .getString('Failed to rename from "{0}" to "{1}"')
                            .format(previousName, text) +
                            '\n' +
                            errorMessage,
                        ),
                        console.debug(errorMessage);
                    }
                  })(inputElement);
            },
            function () {
              c(previousName, attributeValue);
            },
            !1,
            newlyCreated,
            !0,
            utilities.pathByDeleteLastComponent(attributeValue),
          ),
          renameInput.focus();
      }
    };
  },
);
