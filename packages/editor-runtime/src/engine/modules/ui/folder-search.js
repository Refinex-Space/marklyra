// ui/folder-search.
// SystemJS module 4b. Dependencies: e, 11, 27, 33.
$__System.registerDynamic(
  '4b',
  ['e', '11', '27', '33'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var renderEndIndex,
      jquery = requireModule('e'),
      utilities = requireModule('11'),
      map = requireModule('27').map,
      QuickOpenSearch =
        (requireModule('33'),
        function (editor) {
          (this.editor = editor), (this.worker = null);
        }),
      searchItemTemplate = jquery(jquery('#marklyra-quick-open-item-templ').html()),
      loadingItemTemplate = jquery(jquery('#marklyra-quick-loading-item-templ').html()),
      resultsContainer = jquery('.marklyra-quick-open-list'),
      resultsList = jquery('.marklyra-quick-open-list-inner'),
      queryInput = jquery('#marklyra-quick-open-input input'),
      items = [],
      currentItems = [],
      recentFiles = [],
      recentFolders = [],
      resultOffset = 0,
      localItems = [],
      previousQuery = '',
      textParts = [],
      rowHeight = 40,
      visibleRowCount = 8,
      renderedBlock = -1,
      previousSelection = null,
      homePathPattern = null,
      searchPending = 0,
      needsRemoteSearch = !0,
      selectedIndex = -1,
      rowsPerBlock = 20;
    function M(filePath, isDirectory) {
      File.isMac &&
        (isDirectory
          ? bridge.callHandler('controller.openFolder', filePath)
          : bridge.callHandler('path.openFile', filePath)),
        File.isNode &&
          (isDirectory
            ? JSBridge.invoke('app.openFolder', filePath, !0)
            : JSBridge.invoke('app.openFileOrFolder', filePath, {
                mountFolder: (function (text, candidatePath) {
                  var pathSeparator = File.isWin ? '\\' : '/';
                  return (
                    text &&
                    candidatePath &&
                    0 == candidatePath.indexOf(text.replace(/[\/\\]$/, '') + pathSeparator)
                  );
                })(File.getMountFolder(), filePath)
                  ? File.getMountFolder()
                  : void 0,
              }));
    }
    function L(text) {
      var searchValue = File.getMountFolder();
      if (searchValue) {
        let separatorIndex = searchValue.lastIndexOf(File.isWin ? '\\' : '/'),
          textSlice = searchValue.substring(0, separatorIndex + 1);
        if (0 === text.indexOf(searchValue)) return text.substring(textSlice.length);
      }
      return (
        !homePathPattern &&
          File.option.userPath &&
          (homePathPattern = new RegExp('^' + utilities.escapeRegExp(File.option.userPath))),
        (text = homePathPattern ? text.replace(homePathPattern, '~') : text).length > 60
          ? text.substring(0, 30) + '...' + text.substring(text.length - 30, text.length)
          : text
      );
    }
    function N(entryOrPath, container, itemIndex, isDirectory) {
      var titleText, textSlice, text;
      if (entryOrPath.n)
        (titleText = entryOrPath.n),
          (textSlice = entryOrPath.p.replace(/[\/\\][^\/\\]+$/, '') + (File.isWin ? '\\' : '/')),
          (text = entryOrPath.p);
      else {
        text = entryOrPath;
        var match = /[^\\\/]+$/.exec(entryOrPath);
        (titleText = match[0]), (textSlice = text.substring(0, match.index));
      }
      function d(inputText) {
        return textParts.length
          ? inputText
              .replace(/</g, '')
              .replace(/>/g, '')
              .replace(
                new RegExp('((' + textParts.join(')|(') + '))', 'gi'),
                function (unusedParameter1, callbackText) {
                  return '<b>' + callbackText.replace(/</g, '').replace(/>/g, '') + '</b>';
                },
              )
              .replace(/\uE27A/g, '&lt;')
              .replace(/\uE27B/g, '&gt;')
              .replace(/&/g, '&amp;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;')
          : utilities.escapeForPreWrap(inputText);
      }
      (titleText = d(titleText)), isDirectory && (titleText += File.isWin ? '\\' : '/');
      var infoRow = container.children('.marklyra-quick-open-info-item'),
        itemElement = searchItemTemplate
          .clone()
          .find('.marklyra-quick-open-item-title')
          .html(titleText)
          .end()
          .find('.marklyra-quick-open-item-path')
          .html(d(entryOrPath.rp || L(textSlice)))
          .end()
          .attr('data-is-dir', isDirectory || !1)
          .attr('data-path', text)
          .attr('data-index', itemIndex + '')
          .addClass(selectedIndex == itemIndex ? 'active' : '');
      infoRow.length
        ? infoRow.before(itemElement)
        : container.append(itemElement).css('translate3d', '(0, 0, 0)');
    }
    function D(itemIndex) {
      var groupOffset = 0;
      return (
        localItems.forEach(function (item) {
          item < itemIndex && (groupOffset += 20);
        }),
        groupOffset
      );
    }
    function R(direction) {
      if (items.length) {
        (selectedIndex = -1 == selectedIndex ? 0 : (selectedIndex + direction) % items.length),
          jquery('.marklyra-quick-open-item.active').removeClass('active'),
          jquery(".marklyra-quick-open-item[data-index='" + selectedIndex + "']").addClass(
            'active',
          );
        var groupOffset = D(selectedIndex),
          itemTop = selectedIndex * rowHeight + groupOffset,
          scrollOffset = resultsContainer.scrollTop();
        (itemTop < scrollOffset || itemTop > scrollOffset + rowHeight * visibleRowCount - 25) &&
          resultsContainer.scrollTop(
            Math.min(itemTop, (items.length - visibleRowCount) * rowHeight + D(items.length)) - 4,
          );
      }
    }
    function B(unusedParameter1, container) {
      container = container || resultsList;
      var resultCount = items.length - resultOffset;
      function o(hasResults, container) {
        container.append(
          loadingItemTemplate
            .clone()
            .find('.marklyra-quick-open-info')
            .text(jquery.localize.getString(hasResults ? 'Gathering more results' : 'Searching'))
            .end(),
        );
      }
      function a(blockIndex) {
        if (!(blockIndex < 0)) {
          container.find("[data-block-index='" + blockIndex + "']").remove();
          var blockElement = jquery(
            "<div class='quick-open-group-block' data-block-index='" + blockIndex + "'>",
          )
            .css('position', 'absolute')
            .css('top', blockIndex * rowsPerBlock * 40 + 'px')
            .css('width', '100%');
          if (
            ((renderEndIndex = Math.min(
              resultCount + searchPending,
              blockIndex * rowsPerBlock + rowsPerBlock + searchPending,
            )),
            !(blockIndex * rowsPerBlock > renderEndIndex))
          ) {
            for (var itemIndex = blockIndex * rowsPerBlock; itemIndex < renderEndIndex; itemIndex++)
              itemIndex == resultCount && searchPending
                ? o(resultCount, blockElement)
                : N(items[itemIndex + resultOffset], blockElement, itemIndex + resultOffset);
            container.append(blockElement);
          }
        }
      }
      var scrollOffset = resultsContainer.scrollTop(),
        firstVisibleRow = Math.floor(scrollOffset / 40),
        blockIndex = Math.floor(firstVisibleRow / rowsPerBlock);
      blockIndex != renderedBlock &&
        (a((renderedBlock = blockIndex) - 1), a(renderedBlock), a(renderedBlock + 1));
    }
    function P(resultCount, precedingCount, groupElement) {
      if (resultCount) {
        var element = groupElement.parent().show();
        return (
          precedingCount > 0
            ? element.addClass('marklyra-has-prev')
            : element.removeClass('marklyra-has-prev'),
          !0
        );
      }
      groupElement.parent().hide();
    }
    function I(inputItems, startIndex, container, isDirectory) {
      O(inputItems),
        inputItems.length && localItems.push(startIndex),
        container.html(''),
        inputItems.forEach(function (item, itemIndex) {
          N(item, container, startIndex + itemIndex, isDirectory);
        }),
        P(inputItems.length, startIndex, container);
    }
    function O(entries) {
      previousSelection &&
        selectedIndex < 0 &&
        (selectedIndex = entries.findIndex(function (item) {
          return item.p == previousSelection;
        }));
    }
    function $(text) {
      var matchingFolders,
        matchingFiles,
        mappedItems = (textParts = text
          .split(/\s+/)
          .filter(utilities.isNotNullOrEmpty)
          .map(function (inputText) {
            return inputText.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
          })).map(function (item) {
          return new RegExp('(.)?' + utilities.normalize(item) + '(.)?', 'i');
        });
      (items = File.bundle.filePath ? [File.bundle.filePath] : []),
        (localItems = []),
        (selectedIndex = -1);
      var precedingCount = 0;
      File.getMountFolder()
        ? ((matchingFiles = H(
            mappedItems,
            textParts.length ? recentFiles : recentFiles.slice(0, 12),
            items,
          )),
          (matchingFolders = H(
            mappedItems,
            textParts.length ? recentFolders : recentFolders.slice(0, 7),
            items,
          )))
        : ((matchingFolders = H(
            mappedItems,
            textParts.length ? recentFolders : recentFolders.slice(0, 7),
            items,
          )),
          (matchingFiles = H(
            mappedItems,
            textParts.length ? recentFiles : recentFiles.slice(0, 12),
            items,
          )));
      var matchingCachedFiles = H(mappedItems, currentItems, items);
      if (
        (items[0] === File.bundle.filePath && items.splice(0, 1),
        I(matchingFolders, precedingCount, jquery('#marklyra-quick-open-folder-list-inner'), !0),
        I(
          matchingFiles,
          (precedingCount += matchingFolders.length),
          jquery('#marklyra-quick-open-recent-list-inner'),
        ),
        (function (entries, startIndex) {
          (renderedBlock = -1),
            O(entries),
            entries.length && localItems.push(startIndex),
            (resultOffset = startIndex),
            resultsList.html('').height(rowHeight * (entries.length + searchPending)),
            P(entries.length + searchPending, startIndex, resultsList) &&
              (0 == resultOffset
                ? resultsList.prev().css('height', '0')
                : resultsList.prev().css('height', 'auto')),
            B(0, resultsList);
        })(matchingCachedFiles, (precedingCount += matchingFiles.length)),
        (precedingCount += matchingCachedFiles.length) > 0 &&
          !jquery('.marklyra-quick-open-item.active').length)
      ) {
        var element = jquery('.marklyra-quick-open-item')[0];
        element && element.classList.add('active');
      }
    }
    function H(queryPatterns, inputItems, callbackItems) {
      callbackItems = callbackItems || [];
      var searchValue = File.getMountFolder() + (File.isWin ? '\\' : '/'),
        matches = [],
        matchedPaths = [];
      return (
        queryPatterns.length
          ? (inputItems.forEach(function (item) {
              var tokenScore,
                matchScore = 0;
              if (callbackItems.indexOf(item.p) > -1) return;
              let insideMountFolder = searchValue && 0 == item.p.indexOf(searchValue);
              for (var itemIndex = 0; itemIndex < queryPatterns.length; itemIndex++) {
                if (!(tokenScore = 2 * U(item.n, queryPatterns[itemIndex]))) {
                  let text = item.p;
                  (text =
                    item.rp || L(text.replace(/[\/\\][^\/\\]+$/, '') + (File.isWin ? '\\' : '/'))),
                    (item.rp = text),
                    (tokenScore = U(text, queryPatterns[itemIndex]));
                }
                if (!tokenScore) return;
                matchScore += tokenScore;
              }
              insideMountFolder && (matchScore += 3),
                (item.s = matchScore),
                matches.push(item),
                matchedPaths.push(item.p);
            }),
            matches.sort(function (leftResult, rightResult) {
              var scoreDifference = rightResult.s - leftResult.s;
              return scoreDifference || rightResult.d - leftResult.d;
            }))
          : ((matches = inputItems.filter(function (item) {
              return -1 == callbackItems.indexOf(item.p);
            })).sort(function (leftResult, rightResult) {
              var folderPriority =
                (0 == rightResult.p.indexOf(searchValue) ? 1 : 0) -
                (0 == leftResult.p.indexOf(searchValue) ? 1 : 0);
              return folderPriority || rightResult.d - leftResult.d;
            }),
            (matchedPaths = matches.map(function (item) {
              return item.p;
            }))),
        callbackItems.splice.apply(callbackItems, [callbackItems.length, 0].concat(matchedPaths)),
        matches
      );
    }
    function U(normalizedPath, queryPattern) {
      normalizedPath = utilities.normalize(normalizedPath);
      var patternMatch =
        queryPattern.exec(normalizedPath) ||
        queryPattern.exec(utilities.removeDiacritics(normalizedPath));
      return patternMatch
        ? ((patternMatch[1] = patternMatch[1] || ''),
          (patternMatch[3] = patternMatch[3] || ''),
          4 -
            patternMatch[1].length -
            (/\w/.test(patternMatch[1]) ? 1 : 0) -
            (/\w/.test(patternMatch[3]) ? 1 : 0))
        : 0;
    }
    function j(queryText) {
      (previousSelection = items[selectedIndex]),
        needsRemoteSearch
          ? (File.getMountFolder() && this.setSearchState(1),
            File.isMac && bridge.callHandler('quickOpen.query', queryText),
            File.isNode &&
              File.mountFolder_ &&
              this.worker.postMessage(['quickFind', File.mountFolder_, queryText]))
          : this.setSearchState(0),
        $.call(this, queryText),
        File.isMac && bridge.callHandler('quickOpen.reindexFolderIfNeeded');
    }
    (QuickOpenSearch.prototype.init = function () {
      this.bindEvent(),
        File.isMac
          ? (this.registerBridge(), bridge.callHandler('quickOpen.cacheRecentFiles'))
          : File.isNode &&
            (this.initWorker(),
            (needsRemoteSearch = !1),
            JSBridge.invoke('setting.getRecentFiles').then((result) => {
              var { files: recentFileEntries, folders: recentFolderEntries } = result;
              this.setRecentFiles(recentFileEntries.map((item) => item.path));
              var pinnedFolders = [],
                otherFolders = [];
              recentFolderEntries.forEach((item) => {
                item.pinned ? pinnedFolders.push(item) : otherFolders.push(item);
              }),
                this.setRecentFolders(pinnedFolders.concat(otherFolders).map((item) => item.path));
            }),
            this.cacheFolder(File.getMountFolder()),
            this.listenIpc());
    }),
      (QuickOpenSearch.prototype.registerBridge = function () {
        var receiver = this;
        bridge.registerHandler('quickOpen.initFileCache', function (cacheArguments, reply) {
          receiver.initFileCache.apply(receiver, cacheArguments || []), reply && reply();
        }),
          bridge.registerHandler('quickOpen.updateResult', function (results, reply) {
            receiver.updateResult(results), reply && reply();
          }),
          bridge.registerHandler('quickOpen.setSearchState', function (searchState, reply) {
            receiver.setSearchState(searchState), reply && reply();
          }),
          bridge.registerHandler('quickOpen.setRecentFiles', function (filePaths, reply) {
            receiver.setRecentFiles(filePaths), reply && reply();
          }),
          bridge.registerHandler('quickOpen.setRecentFolders', function (folderPaths, reply) {
            receiver.setRecentFolders(folderPaths), reply && reply();
          }),
          bridge.registerHandler('quickOpen.updateCacheByRename', function (renameUpdate, reply) {
            receiver.updateCacheByRename(renameUpdate.src, renameUpdate.dest), reply && reply();
          }),
          bridge.registerHandler('quickOpen.updateCache', function (cacheUpdate, reply) {
            receiver.updateCache(cacheUpdate.toDel, cacheUpdate.toAdd, cacheUpdate.group),
              reply && reply();
          });
      }),
      (QuickOpenSearch.prototype.bindEvent = function () {
        var e,
          delay,
          inputTimer,
          receiver = this;
        queryInput
          .on(
            'input',
            ((e = function () {
              var text = queryInput.val();
              text != previousQuery &&
                ((previousQuery = text.replace(/[()'"%\\\/.?]/g, ' ')),
                j.call(receiver, previousQuery));
            }),
            (delay = 100),
            (inputTimer = null),
            function () {
              inputTimer ||
                (inputTimer = setTimeout(function () {
                  e(), (inputTimer = null);
                }, delay));
            }),
          )
          .on('keydown', function (keyboardEvent) {
            var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
            if (
              'Esc' == map[keyCode] ||
              ('o' == map[keyCode] && keyboardEvent.shiftKey && keyboardEvent.metaKey)
            )
              return receiver.close(), !1;
            if ('Tab' == map[keyCode]) return !1;
            if ('Up' == map[keyCode]) return R(-1), !1;
            if ('Down' == map[keyCode]) return R(1), !1;
            if ('Enter' == map[keyCode]) {
              var selectedElement = jquery('.marklyra-quick-open-item.active')[0];
              if (selectedElement)
                return (
                  M(selectedElement.dataset.path, selectedElement.dataset.isDir + '' == 'true'),
                  receiver.close(),
                  !1
                );
            }
            if (
              File.isMac &&
              keyboardEvent.ctrlKey &&
              !keyboardEvent.metaKey &&
              !keyboardEvent.shiftKey
            ) {
              if ('P' == String.fromCharCode(keyCode)) return R(-1), !1;
              if ('N' == String.fromCharCode(keyCode)) return R(1), !1;
            }
            keyboardEvent.stopPropagation();
          })
          .on('blur', function () {
            setTimeout(receiver.close, 200);
          }),
          resultsContainer
            .on('mousedown', '.marklyra-quick-open-item', function (mouseEvent) {
              1 == mouseEvent.which && M(this.dataset.path, this.dataset.isDir + '' == 'true');
            })
            .on('scroll', B);
      }),
      (QuickOpenSearch.prototype.listenIpc = function () {
        var receiver = this;
        reqnode('electron').ipcRenderer.on(
          'updateQuickOpenCache',
          function (unusedParameter1, cacheUpdate) {
            receiver.updateCache(cacheUpdate.toDel, cacheUpdate.toAdd, cacheUpdate.group);
          },
        );
      }),
      (QuickOpenSearch.prototype.stopQuery = function () {
        File.isMac && bridge.callHandler('quickOpen.stopQuery'),
          File.isNode && this.worker.postMessage(['stopQuery']);
      }),
      (QuickOpenSearch.prototype.initWorker = function () {
        this.worker = new Worker('appsrc/finder-worker.js');
        var receiver = this;
        (this.worker.onmessage = function (workerMessage) {
          switch (workerMessage.data.type) {
            case 'initFileCache':
              receiver.initFileCache.apply(receiver, workerMessage.data.detail);
              break;
            case 'addInitFiles':
              receiver.addInitFiles.apply(receiver, workerMessage.data.detail);
              break;
            case 'removeInitFiles':
              receiver.removeInitFiles.apply(receiver, workerMessage.data.detail);
              break;
            case 'queryMatch':
              receiver.updateResult.apply(receiver, workerMessage.data.detail);
              break;
            case 'queryEnd':
              receiver.setSearchState.apply(receiver, [0]);
          }
        }),
          this.worker.postMessage([
            'setSupportTextBundle',
            File.option.supportTextBundle,
            File.option.supportTextPack,
          ]),
          this.worker.postMessage(['setDefaultExtension', File.option.defaultExtension || 'md']),
          window.dirname && this.worker.postMessage(['nodeInit', window.dirname]);
      }),
      (QuickOpenSearch.prototype.cacheFolder = function (folderPath) {
        (needsRemoteSearch = !0),
          (currentItems = []),
          File.isNode && this.worker.postMessage(['listAllFiles', folderPath]);
      }),
      (QuickOpenSearch.prototype.show = function () {
        var searchPanel = jquery('#marklyra-quick-open:not(:visible)').show();
        this.editor.searchPanel.closePanel(!0),
          searchPanel.length &&
            (queryInput[0].select(),
            (selectedIndex = -1),
            j.call(this, queryInput.val().replace(/[()'"%\\\/.?]/g, ' '))),
          Analytics.record('QuickOpen');
      }),
      (QuickOpenSearch.prototype.close = function () {
        jquery('#marklyra-quick-open:visible').hide().length &&
          File.isMac &&
          bridge.callHandler('quickOpen.stopQuery'),
          (selectedIndex = -1);
      }),
      (QuickOpenSearch.prototype.appendResultAtEnd = function (inputItems, startIndex) {
        var element = resultsList.children().last();
        return (
          !!(
            element.hasClass('quick-open-group-block') &&
            element[0].childElementCount + inputItems.length <= rowsPerBlock
          ) &&
          (inputItems.forEach(function (item, itemIndex) {
            N(item, element, startIndex + itemIndex);
          }),
          !0)
        );
      }),
      (QuickOpenSearch.prototype.updateResult = function (filteredItems) {
        filteredItems = filteredItems.filter(function (searchValue) {
          return (
            'object' == typeof searchValue && (searchValue.rp = ''),
            -1 == items.indexOf(searchValue)
          );
        });
        var itemsLength = items.length;
        filteredItems.length &&
          ((items = items.concat(filteredItems)),
          resultsList.height(rowHeight * (items.length - resultOffset + searchPending)),
          items.length - itemsLength == filteredItems.length &&
          this.appendResultAtEnd(filteredItems, itemsLength)
            ? P(filteredItems.length, itemsLength, resultsList)
            : ((renderedBlock = -1), resultsList.html(''), B(0, resultsList)));
      }),
      (QuickOpenSearch.prototype.addInitFiles = function (
        inputItems,
        fileNames,
        modificationTimes,
      ) {
        var seenPaths = {};
        currentItems = (currentItems = currentItems.concat(
          inputItems.map(function (item, itemIndex) {
            return { n: fileNames[itemIndex], p: item, d: modificationTimes[itemIndex] };
          }),
        )).filter(function (item) {
          return !seenPaths[item.p] && ((seenPaths[item.p] = 1), !0);
        });
      }),
      (QuickOpenSearch.prototype.removeInitFiles = function (removedPrefix) {
        var length = removedPrefix.length;
        (currentItems = currentItems.filter(function (item) {
          return item.p.substring(0, length) != removedPrefix;
        })),
          this.updateCache(removedPrefix);
      }),
      (QuickOpenSearch.prototype.initFileCache = function (
        inputItems,
        fileNames,
        modificationTimes,
        totalFileCount,
        callbackItems,
      ) {
        (currentItems = inputItems.map(function (item, itemIndex) {
          return { n: fileNames[itemIndex], p: item, d: modificationTimes[itemIndex] };
        })),
          callbackItems &&
            (recentFiles = callbackItems.map(function (item) {
              return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
            })),
          (needsRemoteSearch = totalFileCount > inputItems.length),
          jquery('#marklyra-quick-open:visible').length &&
            0 == textParts.length &&
            this.updateResult(currentItems);
      }),
      (QuickOpenSearch.prototype.updateCache = function (removedPath, addedPath, groupName) {
        var pathSeparator = File.isWin ? '\\' : '/';
        if (
          (removedPath &&
            [recentFiles, recentFolders].forEach(function (item) {
              item.removeIf(function (entry) {
                return (
                  entry.p != removedPath &&
                    0 != (removedPath + pathSeparator).indexOf(entry.p) &&
                    File.isNode &&
                    JSBridge.invoke('setting.removeRecentDocument', removedPath),
                  !0
                );
              });
            }, this),
          addedPath && addedPath != File.bundle.filePath)
        ) {
          var targetGroup = { recentFiles: recentFiles, recentFolders: recentFolders }[groupName];
          targetGroup.removeIf(function (entry) {
            return entry.p == addedPath;
          }),
            targetGroup.unshift({ n: (/[^\\\/]+$/.exec(addedPath) || [])[0] || '', p: addedPath });
        }
      }),
      (QuickOpenSearch.prototype.updateCacheByRename = function (previousPath, nextPath) {
        var pathSeparator = File.isWin ? '\\' : '/',
          cacheGroups = [recentFiles, recentFolders];
        File.isNode && cacheGroups.push(currentItems),
          cacheGroups.forEach(function (inputItems) {
            inputItems.forEach(function (item) {
              (item.p != previousPath && 0 != item.p.indexOf(previousPath + pathSeparator)) ||
                ((item.p = nextPath + item.p.substring(previousPath.length)),
                (item.n = (/[^\\\/]+$/.exec(item.p) || [])[0] || ''));
            });
          }, this);
      }),
      (QuickOpenSearch.prototype.setRecentFiles = function (inputItems) {
        recentFiles = inputItems.map(function (item) {
          return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
        });
      }),
      (QuickOpenSearch.prototype.setRecentFolders = function (inputItems) {
        recentFolders = inputItems.map(function (item) {
          return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
        });
      }),
      (QuickOpenSearch.prototype.setSearchState = function (pending) {
        if (searchPending !== pending) {
          if (pending && renderEndIndex == items.length - resultOffset)
            jquery('.marklyra-quick-open-item:last').after(
              loadingItemTemplate
                .clone()
                .find('.marklyra-quick-open-info')
                .text(
                  jquery.localize.getString(
                    renderEndIndex ? 'Gathering more results' : 'Searching',
                  ),
                )
                .end(),
            ),
              renderEndIndex++;
          else if (!pending) {
            if (jquery('.marklyra-quick-open-info-item').remove().length) {
              var contentHeight = resultsList.height() - 40;
              resultsList.height(contentHeight), contentHeight < 10 && resultsList.parent().hide();
            }
            renderEndIndex == items.length - resultOffset + 1 && renderEndIndex--;
          }
          searchPending = pending;
        }
      }),
      (moduleRecord.exports = QuickOpenSearch);
  },
);
