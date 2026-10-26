// ui/folder-search.
export default function initializeUiFolderSearch(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(openSearchResultPath, 'name', { value: 'M', configurable: true });
  Object.defineProperty(getRelativeResultPath, 'name', { value: 'L', configurable: true });
  Object.defineProperty(appendSearchResult, 'name', { value: 'N', configurable: true });
  Object.defineProperty(getResultGroupOffset, 'name', { value: 'D', configurable: true });
  Object.defineProperty(moveSelectedResult, 'name', { value: 'R', configurable: true });
  Object.defineProperty(renderVisibleResults, 'name', { value: 'B', configurable: true });
  Object.defineProperty(updateGroupVisibility, 'name', { value: 'P', configurable: true });
  Object.defineProperty(renderResultGroup, 'name', { value: 'I', configurable: true });
  Object.defineProperty(restoreResultSelection, 'name', { value: 'O', configurable: true });
  Object.defineProperty(searchCachedEntries, 'name', { value: '$', configurable: true });
  Object.defineProperty(filterMatchingEntries, 'name', { value: 'H', configurable: true });
  Object.defineProperty(matchNormalizedPath, 'name', { value: 'U', configurable: true });
  Object.defineProperty(performSearch, 'name', { value: 'j', configurable: true });

  if (!this) {
    self;
  }
  var renderEndIndex,
    jquery = requireModule('libraries/jquery'),
    utilities = requireModule('shared/utilities'),
    map = requireModule('editing/keyboard-shortcuts').map,
    QuickOpenSearch =
      (requireModule('host/file-integration'),
      function (editor) {
        this.editor = editor;
        this.worker = null;
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
    needsRemoteSearch = true,
    selectedIndex = -1,
    rowsPerBlock = 20;
  function openSearchResultPath(filePath, isDirectory) {
    if (File.isMac) {
      if (isDirectory) {
        bridge.callHandler('controller.openFolder', filePath);
      } else {
        bridge.callHandler('path.openFile', filePath);
      }
    }
    if (File.isNode) {
      if (isDirectory) {
        JSBridge.invoke('app.openFolder', filePath, true);
      } else {
        JSBridge.invoke('app.openFileOrFolder', filePath, {
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
        });
      }
    }
  }
  function getRelativeResultPath(text) {
    var searchValue = File.getMountFolder();
    if (searchValue) {
      let separatorIndex = searchValue.lastIndexOf(File.isWin ? '\\' : '/'),
        textSlice = searchValue.substring(0, separatorIndex + 1);
      if (0 === text.indexOf(searchValue)) {
        return text.substring(textSlice.length);
      }
    }
    if (!homePathPattern && File.option.userPath) {
      homePathPattern = new RegExp('^' + utilities.escapeRegExp(File.option.userPath));
    }
    if ((text = homePathPattern ? text.replace(homePathPattern, '~') : text).length > 60) {
      return text.substring(0, 30) + '...' + text.substring(text.length - 30, text.length);
    } else {
      return text;
    }
  }
  function appendSearchResult(entryOrPath, container, itemIndex, isDirectory) {
    Object.defineProperty(highlightQueryTerms, 'name', { value: 'd', configurable: true });

    var titleText, textSlice, text;
    if (entryOrPath.n) {
      titleText = entryOrPath.n;
      textSlice = entryOrPath.p.replace(/[\/\\][^\/\\]+$/, '') + (File.isWin ? '\\' : '/');
      text = entryOrPath.p;
    } else {
      text = entryOrPath;
      var match = /[^\\\/]+$/.exec(entryOrPath);
      titleText = match[0];
      textSlice = text.substring(0, match.index);
    }
    function highlightQueryTerms(inputText) {
      if (textParts.length) {
        return inputText
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
          .replace(/'/g, '&#39;');
      } else {
        return utilities.escapeForPreWrap(inputText);
      }
    }
    titleText = highlightQueryTerms(titleText);
    if (isDirectory) {
      titleText += File.isWin ? '\\' : '/';
    }
    var infoRow = container.children('.marklyra-quick-open-info-item'),
      itemElement = searchItemTemplate
        .clone()
        .find('.marklyra-quick-open-item-title')
        .html(titleText)
        .end()
        .find('.marklyra-quick-open-item-path')
        .html(highlightQueryTerms(entryOrPath.rp || getRelativeResultPath(textSlice)))
        .end()
        .attr('data-is-dir', isDirectory || false)
        .attr('data-path', text)
        .attr('data-index', itemIndex + '')
        .addClass(selectedIndex == itemIndex ? 'active' : '');
    if (infoRow.length) {
      infoRow.before(itemElement);
    } else {
      container.append(itemElement).css('translate3d', '(0, 0, 0)');
    }
  }
  function getResultGroupOffset(itemIndex) {
    var groupOffset = 0;
    localItems.forEach(function (item) {
      if (item < itemIndex) {
        groupOffset += 20;
      }
    });
    return groupOffset;
  }
  function moveSelectedResult(direction) {
    if (items.length) {
      selectedIndex = -1 == selectedIndex ? 0 : (selectedIndex + direction) % items.length;
      jquery('.marklyra-quick-open-item.active').removeClass('active');
      jquery(".marklyra-quick-open-item[data-index='" + selectedIndex + "']").addClass('active');
      var groupOffset = getResultGroupOffset(selectedIndex),
        itemTop = selectedIndex * rowHeight + groupOffset,
        scrollOffset = resultsContainer.scrollTop();
      if (itemTop < scrollOffset || itemTop > scrollOffset + rowHeight * visibleRowCount - 25) {
        resultsContainer.scrollTop(
          Math.min(
            itemTop,
            (items.length - visibleRowCount) * rowHeight + getResultGroupOffset(items.length),
          ) - 4,
        );
      }
    }
  }
  function renderVisibleResults(unusedParameter1, container) {
    Object.defineProperty(appendLoadingIndicator, 'name', { value: 'o', configurable: true });
    Object.defineProperty(renderResultBlock, 'name', { value: 'a', configurable: true });

    container = container || resultsList;
    var resultCount = items.length - resultOffset;
    function appendLoadingIndicator(hasResults, container) {
      container.append(
        loadingItemTemplate
          .clone()
          .find('.marklyra-quick-open-info')
          .text(jquery.localize.getString(hasResults ? 'Gathering more results' : 'Searching'))
          .end(),
      );
    }
    function renderResultBlock(blockIndex) {
      if (!(blockIndex < 0)) {
        container.find("[data-block-index='" + blockIndex + "']").remove();
        var blockElement = jquery(
          "<div class='quick-open-group-block' data-block-index='" + blockIndex + "'>",
        )
          .css('position', 'absolute')
          .css('top', blockIndex * rowsPerBlock * 40 + 'px')
          .css('width', '100%');
        renderEndIndex = Math.min(
          resultCount + searchPending,
          blockIndex * rowsPerBlock + rowsPerBlock + searchPending,
        );
        if (!(blockIndex * rowsPerBlock > renderEndIndex)) {
          for (var itemIndex = blockIndex * rowsPerBlock; itemIndex < renderEndIndex; itemIndex++) {
            if (itemIndex == resultCount && searchPending) {
              appendLoadingIndicator(resultCount, blockElement);
            } else {
              appendSearchResult(
                items[itemIndex + resultOffset],
                blockElement,
                itemIndex + resultOffset,
              );
            }
          }
          container.append(blockElement);
        }
      }
    }
    var scrollOffset = resultsContainer.scrollTop(),
      firstVisibleRow = Math.floor(scrollOffset / 40),
      blockIndex = Math.floor(firstVisibleRow / rowsPerBlock);
    if (blockIndex != renderedBlock) {
      renderResultBlock((renderedBlock = blockIndex) - 1);
      renderResultBlock(renderedBlock);
      renderResultBlock(renderedBlock + 1);
    }
  }
  function updateGroupVisibility(resultCount, precedingCount, groupElement) {
    if (resultCount) {
      var element = groupElement.parent().show();
      if (precedingCount > 0) {
        element.addClass('marklyra-has-prev');
      } else {
        element.removeClass('marklyra-has-prev');
      }
      return true;
    }
    groupElement.parent().hide();
  }
  function renderResultGroup(inputItems, startIndex, container, isDirectory) {
    restoreResultSelection(inputItems);
    if (inputItems.length) {
      localItems.push(startIndex);
    }
    container.html('');
    inputItems.forEach(function (item, itemIndex) {
      appendSearchResult(item, container, startIndex + itemIndex, isDirectory);
    });
    updateGroupVisibility(inputItems.length, startIndex, container);
  }
  function restoreResultSelection(entries) {
    if (previousSelection && selectedIndex < 0) {
      selectedIndex = entries.findIndex(function (item) {
        return item.p == previousSelection;
      });
    }
  }
  function searchCachedEntries(text) {
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
    items = File.bundle.filePath ? [File.bundle.filePath] : [];
    localItems = [];
    selectedIndex = -1;
    var precedingCount = 0;
    if (File.getMountFolder()) {
      matchingFiles = filterMatchingEntries(
        mappedItems,
        textParts.length ? recentFiles : recentFiles.slice(0, 12),
        items,
      );
      matchingFolders = filterMatchingEntries(
        mappedItems,
        textParts.length ? recentFolders : recentFolders.slice(0, 7),
        items,
      );
    } else {
      matchingFolders = filterMatchingEntries(
        mappedItems,
        textParts.length ? recentFolders : recentFolders.slice(0, 7),
        items,
      );
      matchingFiles = filterMatchingEntries(
        mappedItems,
        textParts.length ? recentFiles : recentFiles.slice(0, 12),
        items,
      );
    }
    var matchingCachedFiles = filterMatchingEntries(mappedItems, currentItems, items);
    if (items[0] === File.bundle.filePath) {
      items.splice(0, 1);
    }
    renderResultGroup(
      matchingFolders,
      precedingCount,
      jquery('#marklyra-quick-open-folder-list-inner'),
      true,
    );
    renderResultGroup(
      matchingFiles,
      (precedingCount += matchingFolders.length),
      jquery('#marklyra-quick-open-recent-list-inner'),
    );
    (function (entries, startIndex) {
      renderedBlock = -1;
      restoreResultSelection(entries);
      if (entries.length) {
        localItems.push(startIndex);
      }
      resultOffset = startIndex;
      resultsList.html('').height(rowHeight * (entries.length + searchPending));
      if (updateGroupVisibility(entries.length + searchPending, startIndex, resultsList)) {
        if (0 == resultOffset) {
          resultsList.prev().css('height', '0');
        } else {
          resultsList.prev().css('height', 'auto');
        }
      }
      renderVisibleResults(0, resultsList);
    })(matchingCachedFiles, (precedingCount += matchingFiles.length));
    if (
      (precedingCount += matchingCachedFiles.length) > 0 &&
      !jquery('.marklyra-quick-open-item.active').length
    ) {
      var element = jquery('.marklyra-quick-open-item')[0];
      if (element) {
        element.classList.add('active');
      }
    }
  }
  function filterMatchingEntries(queryPatterns, inputItems, callbackItems) {
    callbackItems = callbackItems || [];
    var searchValue = File.getMountFolder() + (File.isWin ? '\\' : '/'),
      matches = [],
      matchedPaths = [];
    if (queryPatterns.length) {
      inputItems.forEach(function (item) {
        var tokenScore,
          matchScore = 0;
        if (callbackItems.indexOf(item.p) > -1) {
          return;
        }
        let insideMountFolder = searchValue && 0 == item.p.indexOf(searchValue);
        for (var itemIndex = 0; itemIndex < queryPatterns.length; itemIndex++) {
          if (!(tokenScore = 2 * matchNormalizedPath(item.n, queryPatterns[itemIndex]))) {
            let text = item.p;
            text =
              item.rp ||
              getRelativeResultPath(
                text.replace(/[\/\\][^\/\\]+$/, '') + (File.isWin ? '\\' : '/'),
              );
            item.rp = text;
            tokenScore = matchNormalizedPath(text, queryPatterns[itemIndex]);
          }
          if (!tokenScore) {
            return;
          }
          matchScore += tokenScore;
        }
        if (insideMountFolder) {
          matchScore += 3;
        }
        item.s = matchScore;
        matches.push(item);
        matchedPaths.push(item.p);
      });
      matches.sort(function (leftResult, rightResult) {
        var scoreDifference = rightResult.s - leftResult.s;
        return scoreDifference || rightResult.d - leftResult.d;
      });
    } else {
      (matches = inputItems.filter(function (item) {
        return -1 == callbackItems.indexOf(item.p);
      })).sort(function (leftResult, rightResult) {
        var folderPriority =
          (0 == rightResult.p.indexOf(searchValue) ? 1 : 0) -
          (0 == leftResult.p.indexOf(searchValue) ? 1 : 0);
        return folderPriority || rightResult.d - leftResult.d;
      });
      matchedPaths = matches.map(function (item) {
        return item.p;
      });
    }
    callbackItems.splice.apply(callbackItems, [callbackItems.length, 0].concat(matchedPaths));
    return matches;
  }
  function matchNormalizedPath(normalizedPath, queryPattern) {
    normalizedPath = utilities.normalize(normalizedPath);
    var patternMatch =
      queryPattern.exec(normalizedPath) ||
      queryPattern.exec(utilities.removeDiacritics(normalizedPath));
    if (patternMatch) {
      patternMatch[1] = patternMatch[1] || '';
      patternMatch[3] = patternMatch[3] || '';
      return (
        4 -
        patternMatch[1].length -
        (/\w/.test(patternMatch[1]) ? 1 : 0) -
        (/\w/.test(patternMatch[3]) ? 1 : 0)
      );
    } else {
      return 0;
    }
  }
  function performSearch(queryText) {
    previousSelection = items[selectedIndex];
    if (needsRemoteSearch) {
      if (File.getMountFolder()) {
        this.setSearchState(1);
      }
      if (File.isMac) {
        bridge.callHandler('quickOpen.query', queryText);
      }
      if (File.isNode && File.mountFolder_) {
        this.worker.postMessage(['quickFind', File.mountFolder_, queryText]);
      }
    } else {
      this.setSearchState(0);
    }
    searchCachedEntries.call(this, queryText);
    if (File.isMac) {
      bridge.callHandler('quickOpen.reindexFolderIfNeeded');
    }
  }
  QuickOpenSearch.prototype.init = function () {
    this.bindEvent();
    if (File.isMac) {
      this.registerBridge();
      bridge.callHandler('quickOpen.cacheRecentFiles');
    } else {
      if (File.isNode) {
        this.initWorker();
        needsRemoteSearch = false;
        JSBridge.invoke('setting.getRecentFiles').then((result) => {
          var { files: recentFileEntries, folders: recentFolderEntries } = result;
          this.setRecentFiles(recentFileEntries.map((item) => item.path));
          var pinnedFolders = [],
            otherFolders = [];
          recentFolderEntries.forEach((item) => {
            if (item.pinned) {
              pinnedFolders.push(item);
            } else {
              otherFolders.push(item);
            }
          });
          this.setRecentFolders(pinnedFolders.concat(otherFolders).map((item) => item.path));
        });
        this.cacheFolder(File.getMountFolder());
        this.listenIpc();
      }
    }
  };
  QuickOpenSearch.prototype.registerBridge = function () {
    var receiver = this;
    bridge.registerHandler('quickOpen.initFileCache', function (cacheArguments, reply) {
      receiver.initFileCache.apply(receiver, cacheArguments || []);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.updateResult', function (results, reply) {
      receiver.updateResult(results);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.setSearchState', function (searchState, reply) {
      receiver.setSearchState(searchState);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.setRecentFiles', function (filePaths, reply) {
      receiver.setRecentFiles(filePaths);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.setRecentFolders', function (folderPaths, reply) {
      receiver.setRecentFolders(folderPaths);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.updateCacheByRename', function (renameUpdate, reply) {
      receiver.updateCacheByRename(renameUpdate.src, renameUpdate.dest);
      if (reply) {
        reply();
      }
    });
    bridge.registerHandler('quickOpen.updateCache', function (cacheUpdate, reply) {
      receiver.updateCache(cacheUpdate.toDel, cacheUpdate.toAdd, cacheUpdate.group);
      if (reply) {
        reply();
      }
    });
  };
  QuickOpenSearch.prototype.bindEvent = function () {
    var readChangedQuery,
      delay,
      inputTimer,
      receiver = this;
    queryInput
      .on(
        'input',
        ((readChangedQuery = Object.defineProperty(
          function () {
            var text = queryInput.val();
            if (text != previousQuery) {
              previousQuery = text.replace(/[()'"%\\\/.?]/g, ' ');
              performSearch.call(receiver, previousQuery);
            }
          },
          'name',
          { value: 'e', configurable: true },
        )),
        (delay = 100),
        (inputTimer = null),
        function () {
          if (!inputTimer) {
            inputTimer = setTimeout(function () {
              readChangedQuery();
              inputTimer = null;
            }, delay);
          }
        }),
      )
      .on('keydown', function (keyboardEvent) {
        var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
        if (
          'Esc' == map[keyCode] ||
          ('o' == map[keyCode] && keyboardEvent.shiftKey && keyboardEvent.metaKey)
        ) {
          receiver.close();
          return false;
        }
        if ('Tab' == map[keyCode]) {
          return false;
        }
        if ('Up' == map[keyCode]) {
          moveSelectedResult(-1);
          return false;
        }
        if ('Down' == map[keyCode]) {
          moveSelectedResult(1);
          return false;
        }
        if ('Enter' == map[keyCode]) {
          var selectedElement = jquery('.marklyra-quick-open-item.active')[0];
          if (selectedElement) {
            openSearchResultPath(
              selectedElement.dataset.path,
              selectedElement.dataset.isDir + '' == 'true',
            );
            receiver.close();
            return false;
          }
        }
        if (
          File.isMac &&
          keyboardEvent.ctrlKey &&
          !keyboardEvent.metaKey &&
          !keyboardEvent.shiftKey
        ) {
          if ('P' == String.fromCharCode(keyCode)) {
            moveSelectedResult(-1);
            return false;
          }
          if ('N' == String.fromCharCode(keyCode)) {
            moveSelectedResult(1);
            return false;
          }
        }
        keyboardEvent.stopPropagation();
      })
      .on('blur', function () {
        setTimeout(receiver.close, 200);
      });
    resultsContainer
      .on('mousedown', '.marklyra-quick-open-item', function (mouseEvent) {
        if (1 == mouseEvent.which) {
          openSearchResultPath(this.dataset.path, this.dataset.isDir + '' == 'true');
        }
      })
      .on('scroll', renderVisibleResults);
  };
  QuickOpenSearch.prototype.listenIpc = function () {
    var receiver = this;
    reqnode('electron').ipcRenderer.on(
      'updateQuickOpenCache',
      function (unusedParameter1, cacheUpdate) {
        receiver.updateCache(cacheUpdate.toDel, cacheUpdate.toAdd, cacheUpdate.group);
      },
    );
  };
  QuickOpenSearch.prototype.stopQuery = function () {
    if (File.isMac) {
      bridge.callHandler('quickOpen.stopQuery');
    }
    if (File.isNode) {
      this.worker.postMessage(['stopQuery']);
    }
  };
  QuickOpenSearch.prototype.initWorker = function () {
    this.worker = new Worker('appsrc/finder-worker.js');
    var receiver = this;
    this.worker.onmessage = function (workerMessage) {
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
    };
    this.worker.postMessage([
      'setSupportTextBundle',
      File.option.supportTextBundle,
      File.option.supportTextPack,
    ]);
    this.worker.postMessage(['setDefaultExtension', File.option.defaultExtension || 'md']);
    if (window.dirname) {
      this.worker.postMessage(['nodeInit', window.dirname]);
    }
  };
  QuickOpenSearch.prototype.cacheFolder = function (folderPath) {
    needsRemoteSearch = true;
    currentItems = [];
    if (File.isNode) {
      this.worker.postMessage(['listAllFiles', folderPath]);
    }
  };
  QuickOpenSearch.prototype.show = function () {
    var searchPanel = jquery('#marklyra-quick-open:not(:visible)').show();
    this.editor.searchPanel.closePanel(true);
    if (searchPanel.length) {
      queryInput[0].select();
      selectedIndex = -1;
      performSearch.call(this, queryInput.val().replace(/[()'"%\\\/.?]/g, ' '));
    }
    Analytics.record('QuickOpen');
  };
  QuickOpenSearch.prototype.close = function () {
    if (jquery('#marklyra-quick-open:visible').hide().length && File.isMac) {
      bridge.callHandler('quickOpen.stopQuery');
    }
    selectedIndex = -1;
  };
  QuickOpenSearch.prototype.appendResultAtEnd = function (inputItems, startIndex) {
    var element = resultsList.children().last();
    return (
      !!(
        element.hasClass('quick-open-group-block') &&
        element[0].childElementCount + inputItems.length <= rowsPerBlock
      ) &&
      (inputItems.forEach(function (item, itemIndex) {
        appendSearchResult(item, element, startIndex + itemIndex);
      }),
      true)
    );
  };
  QuickOpenSearch.prototype.updateResult = function (filteredItems) {
    filteredItems = filteredItems.filter(function (searchValue) {
      if ('object' == typeof searchValue) {
        searchValue.rp = '';
      }
      return -1 == items.indexOf(searchValue);
    });
    var itemsLength = items.length;
    if (filteredItems.length) {
      items = items.concat(filteredItems);
      resultsList.height(rowHeight * (items.length - resultOffset + searchPending));
      if (
        items.length - itemsLength == filteredItems.length &&
        this.appendResultAtEnd(filteredItems, itemsLength)
      ) {
        updateGroupVisibility(filteredItems.length, itemsLength, resultsList);
      } else {
        renderedBlock = -1;
        resultsList.html('');
        renderVisibleResults(0, resultsList);
      }
    }
  };
  QuickOpenSearch.prototype.addInitFiles = function (inputItems, fileNames, modificationTimes) {
    var seenPaths = {};
    currentItems = (currentItems = currentItems.concat(
      inputItems.map(function (item, itemIndex) {
        return { n: fileNames[itemIndex], p: item, d: modificationTimes[itemIndex] };
      }),
    )).filter(function (item) {
      return !seenPaths[item.p] && ((seenPaths[item.p] = 1), true);
    });
  };
  QuickOpenSearch.prototype.removeInitFiles = function (removedPrefix) {
    var length = removedPrefix.length;
    currentItems = currentItems.filter(function (item) {
      return item.p.substring(0, length) != removedPrefix;
    });
    this.updateCache(removedPrefix);
  };
  QuickOpenSearch.prototype.initFileCache = function (
    inputItems,
    fileNames,
    modificationTimes,
    totalFileCount,
    callbackItems,
  ) {
    currentItems = inputItems.map(function (item, itemIndex) {
      return { n: fileNames[itemIndex], p: item, d: modificationTimes[itemIndex] };
    });
    if (callbackItems) {
      recentFiles = callbackItems.map(function (item) {
        return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
      });
    }
    needsRemoteSearch = totalFileCount > inputItems.length;
    if (jquery('#marklyra-quick-open:visible').length && 0 == textParts.length) {
      this.updateResult(currentItems);
    }
  };
  QuickOpenSearch.prototype.updateCache = function (removedPath, addedPath, groupName) {
    var pathSeparator = File.isWin ? '\\' : '/';
    if (removedPath) {
      [recentFiles, recentFolders].forEach(function (item) {
        item.removeIf(function (entry) {
          if (
            entry.p != removedPath &&
            0 != (removedPath + pathSeparator).indexOf(entry.p) &&
            File.isNode
          ) {
            JSBridge.invoke('setting.removeRecentDocument', removedPath);
          }
          return true;
        });
      }, this);
    }
    if (addedPath && addedPath != File.bundle.filePath) {
      var targetGroup = { recentFiles: recentFiles, recentFolders: recentFolders }[groupName];
      targetGroup.removeIf(function (entry) {
        return entry.p == addedPath;
      });
      targetGroup.unshift({ n: (/[^\\\/]+$/.exec(addedPath) || [])[0] || '', p: addedPath });
    }
  };
  QuickOpenSearch.prototype.updateCacheByRename = function (previousPath, nextPath) {
    var pathSeparator = File.isWin ? '\\' : '/',
      cacheGroups = [recentFiles, recentFolders];
    if (File.isNode) {
      cacheGroups.push(currentItems);
    }
    cacheGroups.forEach(function (inputItems) {
      inputItems.forEach(function (item) {
        if (!(item.p != previousPath && 0 != item.p.indexOf(previousPath + pathSeparator))) {
          item.p = nextPath + item.p.substring(previousPath.length);
          item.n = (/[^\\\/]+$/.exec(item.p) || [])[0] || '';
        }
      });
    }, this);
  };
  QuickOpenSearch.prototype.setRecentFiles = function (inputItems) {
    recentFiles = inputItems.map(function (item) {
      return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
    });
  };
  QuickOpenSearch.prototype.setRecentFolders = function (inputItems) {
    recentFolders = inputItems.map(function (item) {
      return { n: (/[^\\\/]+$/.exec(item) || [])[0] || '', p: item };
    });
  };
  QuickOpenSearch.prototype.setSearchState = function (pending) {
    if (searchPending !== pending) {
      if (pending && renderEndIndex == items.length - resultOffset) {
        jquery('.marklyra-quick-open-item:last').after(
          loadingItemTemplate
            .clone()
            .find('.marklyra-quick-open-info')
            .text(
              jquery.localize.getString(renderEndIndex ? 'Gathering more results' : 'Searching'),
            )
            .end(),
        );
        renderEndIndex++;
      } else {
        if (!pending) {
          if (jquery('.marklyra-quick-open-info-item').remove().length) {
            var contentHeight = resultsList.height() - 40;
            resultsList.height(contentHeight);
            if (contentHeight < 10) {
              resultsList.parent().hide();
            }
          }
          if (renderEndIndex == items.length - resultOffset + 1) {
            renderEndIndex--;
          }
        }
      }
      searchPending = pending;
    }
  };
  moduleRecord.exports = QuickOpenSearch;
}
