// ui/file-search-results.
export default function initializeUiFileSearchResults(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var currentText,
    utilities = requireModule('shared/utilities'),
    jquery = requireModule('libraries/jquery'),
    fileIntegration = requireModule('host/file-integration'),
    map = requireModule('editing/keyboard-shortcuts').map,
    matchedLines = 30;
  moduleRecord.exports = class {
    constructor(parent) {
      this.editor = parent.editor;
      this.parent = parent;
      this.templateDom = jquery.parseHTML(
        document.querySelector('#file-search-item-template').innerHTML.trim(),
      )[0];
      this.caseSensitive = File.option.fileSearchCaseSensitive;
      this.wholeWord = File.option.fileSearchWholeWord;
      this.useRegexp = File.option.fileSearchUseRegexp;
      this.bindEvents();
      if (File.isMac) {
        this.registerBridge();
      }
    }
    bindEvents() {
      var receiver = this;
      File.isWin;
      if (File.isNode) {
        var wheelCooldown,
          timerId,
          currentTimerId,
          scrollDirection,
          initialScrollTop = null;
        [
          document.querySelector('#file-library'),
          document.querySelector('#outline-content'),
        ].forEach(function (item, itemIndex) {
          var isOutlineContainer = 1 == itemIndex;
          item.addEventListener('wheel', function (event) {
            var horizontalOnly = 0 === event.deltaY;
            if (event.deltaX > 16 || event.deltaX < -16) {
              if (timerId) {
                clearTimeout(timerId);
              }
              return void (timerId = setTimeout(function () {
                timerId = null;
              }, 50));
            }
            if (wheelCooldown) {
              if (!horizontalOnly) {
                event.preventDefault();
              }
            } else {
              var directionChanged = scrollDirection !== (event.deltaY < 0 ? -1 : 1);
              scrollDirection = event.deltaY < 0 ? -1 : 1;
              if (directionChanged) {
                clearTimeout(currentTimerId);
                currentTimerId = null;
              }
            }
            if (currentTimerId) {
              clearTimeout(currentTimerId);
            } else {
              if (0 == event.deltaX) {
                initialScrollTop = item.scrollTop;
              }
            }
            currentTimerId = setTimeout(function () {
              initialScrollTop = null;
              currentTimerId = null;
            }, 40);
            if (wheelCooldown || -1 == initialScrollTop) {
              if (!horizontalOnly) {
                event.preventDefault();
              }
            } else {
              if (0 === initialScrollTop && !timerId) {
                var searchVisible = isOutlineContainer
                  ? receiver.parent.outline.isSearchShown()
                  : receiver.isShown_;
                if (event.deltaY < 0 && item.scrollTop < 2 && !searchVisible) {
                  wheelCooldown = setTimeout(function () {
                    wheelCooldown = null;
                  }, 50);
                  clearTimeout(currentTimerId);
                  currentTimerId = setTimeout(function () {
                    initialScrollTop = null;
                  }, 50);
                  receiver.showSearch(isOutlineContainer);
                  event.preventDefault();
                  return void (initialScrollTop = -1);
                }
                if (searchVisible && event.deltaY > 0) {
                  if (jquery('#file-library-search-input').val().length) {
                    var element = document.querySelector('#outline-content');
                    if (element.scrollHeight > element.clientHeight) {
                      return;
                    }
                  }
                  receiver.hideSearch(isOutlineContainer);
                  wheelCooldown = setTimeout(function () {
                    wheelCooldown = null;
                  }, 50);
                  clearTimeout(currentTimerId);
                  currentTimerId = setTimeout(function () {
                    initialScrollTop = null;
                  }, 50);
                  event.preventDefault();
                  return void (initialScrollTop = -1);
                }
              }
            }
          });
        });
        jquery('#info-panel-tab-search-back').on('click', function () {
          receiver.hide();
        });
      } else {
        jquery('.sidebar-osx-tab')
          .on('click', '#sidebar-search-btn', function () {
            receiver.showSearch(receiver.parent.isOutlineShown());
          })
          .on('click', '#marklyra-sidebar-search-back-btn', function () {
            receiver.hideSearch(receiver.parent.isOutlineShown());
          });
      }
      function scrollResultIntoView(itemElement, scrollContainer) {
        if (scrollContainer.scrollTop > itemElement.offsetTop) {
          scrollContainer.scrollTop = Math.max(itemElement.offsetTop - 2, 0);
        } else {
          if (
            scrollContainer.scrollTop + scrollContainer.offsetHeight <
            itemElement.offsetTop + itemElement.offsetHeight
          ) {
            scrollContainer.scrollTop = itemElement.offsetTop;
          }
        }
      }
      var currentElement = document.querySelector('#file-library-search-input');
      currentElement.addEventListener('keydown', function (keyboardEvent) {
        var moveUp,
          domNode,
          element,
          currentDomNode,
          localElement,
          trimmedText,
          keyName = map[keyboardEvent.keyCode || keyboardEvent.which];
        if ('Esc' == keyName) {
          receiver.onKeyDown = true;
          setTimeout(function () {
            receiver.onKeyDown = false;
          }, 300);
          receiver.hideSearch(receiver.parent.isOutlineShown());
          keyboardEvent.stopPropagation();
        } else {
          if ('Enter' == keyName) {
            if (receiver.isShown_) {
              localElement = document
                .querySelector('#file-library-search-result')
                .querySelector('.select');
              trimmedText = currentElement.value.trim();
              if (localElement && currentText == trimmedText) {
                if (localElement.classList.contains('marklyra-search-item')) {
                  localElement = localElement.querySelector('.marklyra-search-item-summary');
                }
                jquery(localElement).trigger('click').removeClass('select');
              } else {
                receiver.search(trimmedText);
              }
            } else {
              if (receiver.parent.isOutlineShown()) {
                receiver.parent.outline.onEnterKey(keyboardEvent);
              }
            }
          } else {
            if ('Up' == keyName || 'Down' == keyName) {
              if (receiver.isShown_) {
                moveUp = 'Up' == keyName;
                element = document.querySelector('#file-library-search-result');
                if (
                  (currentDomNode =
                    element.querySelector('.select') || element.querySelector('.active'))
                ) {
                  if (
                    (domNode = moveUp
                      ? currentDomNode.previousElementSibling
                      : currentDomNode.nextElementSibling) &&
                    (domNode.classList.contains('marklyra-search-item-line-more') &&
                      (domNode.parentElement.parentElement.classList.contains(
                        'marklyra-search-item-expand',
                      ) ||
                        (domNode = null)),
                    domNode)
                  ) {
                    currentDomNode.classList.remove('select');
                    domNode.classList.add('select');
                    scrollResultIntoView(domNode, element);
                  } else {
                    if (
                      currentDomNode.classList.contains('marklyra-search-item-line') &&
                      ((currentDomNode = currentDomNode.parentElement.parentElement),
                      (domNode = moveUp
                        ? currentDomNode.previousElementSibling
                        : currentDomNode.nextElementSibling) &&
                        (domNode = moveUp
                          ? domNode.classList.contains('marklyra-search-item-line-more')
                            ? domNode.querySelector('.marklyra-search-item-line:last-child')
                            : domNode.querySelector('.marklyra-search-item-line-expand') ||
                              domNode.querySelector('.marklyra-search-item-line:last-child')
                          : domNode.querySelector('.marklyra-search-item-line:first-child')),
                      domNode)
                    ) {
                      currentDomNode.classList.remove('select');
                      domNode.classList.add('select');
                      scrollResultIntoView(domNode, element);
                    }
                  }
                } else {
                  if ((currentDomNode = element.querySelector('.marklyra-search-item'))) {
                    currentDomNode.classList.add('select');
                  }
                  if (currentDomNode) {
                    scrollResultIntoView(currentDomNode, element);
                  }
                }
              } else {
                if (receiver.parent.isOutlineShown()) {
                  receiver.parent.outline.moveUpOrDown('Up' == keyName);
                }
              }
            } else {
              if ('Tab' == keyName) {
                receiver.editor.searchPanel.closePanel();
              }
            }
          }
        }
      });
      currentElement.addEventListener('focus', function (unusedParameter1) {
        var element = document.querySelector('#file-library-search-result .select');
        if (element) {
          element.classList.remove('select');
        }
      });
      var caseButton = document.querySelector('#filesearch-case-option-btn');
      caseButton.addEventListener('mousedown', function (event) {
        caseButton.classList.toggle('select');
        receiver.caseSensitive = !receiver.caseSensitive;
        JSBridge.putSetting('fileSearchCaseSensitive', receiver.caseSensitive);
        event.preventDefault();
        event.stopPropagation();
      });
      if (receiver.caseSensitive) {
        caseButton.classList.add('select');
      }
      var wordButton = document.querySelector('#filesearch-word-option-btn');
      wordButton.addEventListener('mousedown', function (event) {
        wordButton.classList.toggle('select');
        receiver.wholeWord = !receiver.wholeWord;
        JSBridge.putSetting('fileSearchWholeWord', receiver.wholeWord);
        event.preventDefault();
        event.stopPropagation();
      });
      if (receiver.wholeWord) {
        wordButton.classList.add('select');
      }
      var regexpButton = document.querySelector('#filesearch-regexp-option-btn');
      regexpButton.addEventListener('mousedown', function (event) {
        regexpButton.classList.toggle('select');
        receiver.useRegexp = !receiver.useRegexp;
        JSBridge.putSetting('fileSearchUseRegexp', receiver.useRegexp);
        event.preventDefault();
        event.stopPropagation();
      });
      if (receiver.useRegexp) {
        regexpButton.classList.add('select');
      }
      jquery('#file-library-search')
        .on('click', '.marklyra-search-item-line-expand', function (event) {
          jquery(this).closest('.marklyra-search-item').addClass('marklyra-search-item-expand');
          event.stopPropagation();
        })
        .on('click', '.marklyra-search-item-collapse-icon', function (event) {
          var element = jquery(this).closest('.marklyra-search-item');
          if (element.hasClass('marklyra-search-item-collapse')) {
            element.removeClass('marklyra-search-item-collapse');
            element.addClass('marklyra-search-item-expand');
          } else {
            element.addClass('marklyra-search-item-collapse');
            element.removeClass('marklyra-search-item-expand');
          }
          event.stopPropagation();
        })
        .on('click', '.marklyra-search-item-summary', function (keyboardEvent) {
          jquery('#file-library-search-result')
            .find('.active, .select')
            .removeClass('active select');
          var filePath = jquery(this).closest('[data-path]').addClass('active').attr('data-path');
          if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
            receiver.parent.openWithCtrl(filePath);
          } else {
            receiver.parent.openFile(filePath);
          }
        })
        .on('click', '.marklyra-search-item-line', function (keyboardEvent) {
          var line = this.dataset.line,
            match = this.dataset.match,
            lineText = this.dataset.lineText,
            filePath = jquery(this).closest('[data-path]').attr('data-path'),
            currentReceiver = this;
          keyboardEvent.stopPropagation();
          keyboardEvent.preventDefault();
          if (void 0 != line) {
            if (match) {
              if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
                receiver.parent.openWithCtrl(filePath);
              } else {
                if (filePath == fileIntegration.getCurrentFilePath()) {
                  receiver.goto(line - 0, match, lineText);
                  jquery('#file-library-search-result')
                    .find('.active, .select')
                    .removeClass('active select');
                  currentReceiver.classList.add('active');
                } else {
                  window._hasSwitchCallback = true;
                  receiver.parent.openFile(filePath, function () {
                    receiver.goto(line - 0, match, lineText);
                    jquery('#file-library-search-result')
                      .find('.active, .select')
                      .removeClass('active select');
                    currentReceiver.classList.add('active');
                  });
                }
              }
            } else {
              if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
                receiver.parent.openWithCtrl(filePath);
              } else {
                window._hasSwitchCallback = true;
                if (filePath != fileIntegration.getCurrentFilePath()) {
                  receiver.parent.openFile(filePath, function () {
                    jquery('#file-library-search-result')
                      .find('.active, .select')
                      .removeClass('active select');
                    currentReceiver.classList.add('active');
                  });
                }
              }
            }
          }
        });
    }
    registerBridge() {
      var receiver = this;
      bridge.registerHandler('globalSearch.onSearchUpdate', function (searchUpdate) {
        if (searchUpdate.emptyFilePathMatch) {
          if (searchUpdate.text) {
            searchUpdate.text.split(/\r?\n/g).map(function (path) {
              receiver.onSearchUpdate(path, true, { path: path, matches: [] });
            });
          }
        } else {
          receiver.onSearchUpdate(searchUpdate.text, searchUpdate.pathMatch);
        }
      });
      bridge.registerHandler('globalSearch.onErrorMsg', function (errorMessage) {
        receiver.onErrorMsg(errorMessage);
      });
    }
    toggleSearch() {
      if (this.isActive()) {
        this.hide();
      } else {
        this.show();
      }
    }
    showSearch(forOutline) {
      if (forOutline) {
        this.parent.outline.showSearch();
      } else {
        this.show();
      }
    }
    hideSearch(forOutline) {
      if (forOutline) {
        this.parent.outline.hideSearch();
      } else {
        this.hide();
      }
    }
    markOpenedFile(filePath) {
      if (document.querySelector('.marklyra-on-search')) {
        var searchValue = File.getMountFolder();
        if (searchValue && 0 === filePath.indexOf(searchValue)) {
          if (!document.querySelector('.marklyra-search-item-line.active')) {
            jquery(
              ".marklyra-search-item[data-path='" + utilities.escapeSelector(filePath) + "']",
            ).addClass('active');
          }
        }
      }
    }
    isActive() {
      return this.isShown_ && jquery('#marklyra-sidebar').hasClass('marklyra-on-search');
    }
    show(reuseResults) {
      if (!this.parent.isFileTabShown()) {
        this.parent.showSidebar('files');
      }
      this.isShown_ = true;
      var element = jquery('#marklyra-sidebar'),
        elements = element.find('#file-library-search-input');
      if (reuseResults && currentText && element.find('.marklyra-search-item').length) {
        element.addClass('marklyra-show-search marklyra-on-search');
        elements.val(currentText).focus();
      }
      setTimeout(function () {
        JSBridge.menu.update({
          'View→Search': { state: element.hasClass('marklyra-on-search') },
        });
      }, 100);
      if (element.hasClass('marklyra-show-search')) {
        elements.focus();
      } else {
        elements.attr('placeholder', jquery.localize.getString('Search', 'Front'));
        if (File.isNodeHtml) {
          elements.css('width', '100%');
          element.find('#close-outline-filter-btn').hide();
        }
        element.addClass('marklyra-show-search');
        var selectionRange = this.editor.selection.getRangy();
        editor.lastCursor = editor.selection.buildUndo(selectionRange);
        this.clearSearch();
        if (selectionRange && selectionRange.toString().trim().length) {
          elements.val(selectionRange.toString().trim().replace(/\n.*$/, ''));
        }
        elements.focus();
        if (currentText != elements.val()) {
          elements.val('');
        }
        if (elements.val()) {
          elements.select();
        }
      }
    }
    clearSearch() {
      jquery('#file-library-search-result').html('');
    }
    clearContentHighlight() {
      if (this.isShown_) {
        jquery('#file-library-search-result').find('.select').removeClass('select');
        jquery('.md-search-select').removeClass('md-search-select');
        this.editor.searchPanel.clearSearch();
        this.editor.searchPanel.resetSearchStatus();
        jquery('.md-search-hit').removeClass('md-search-hit');
      }
    }
    hide() {
      this.isShown_ = false;
      if (0 != jquery('#marklyra-sidebar.marklyra-show-search').length) {
        jquery('#marklyra-sidebar')
          .removeClass('marklyra-show-search')
          .removeClass('marklyra-on-search');
        jquery('#info-panel-tab-file .info-panel-tab-border').addClass('marklyra-fadein-right');
        setTimeout(function () {
          jquery('#info-panel-tab-file .info-panel-tab-border').removeClass(
            'marklyra-fadein-right',
          );
        }, 400);
        this.editor.searchPanel.closePanel();
      }
    }
    onErrorMsg() {
      var element = document.querySelector('#file-library-search-result'),
        divElement = document.createElement('div');
      divElement.classList.add('marklyra-search-result-error-message');
      divElement.textContent = this.curError;
      element.appendChild(divElement);
    }
    onSearchUpdate(inputText, fileNameOnly, fileResult) {
      var receiver = this,
        pathSeparator = File.isWin ? '\\' : '/',
        element = document.querySelector('#file-library-search-result');
      if (element.querySelector('.marklyra-search-result-error-message')) {
        element.innerHTML = '';
      }
      var searchPattern = void 0,
        getSearchPattern = function () {
          if (void 0 == searchPattern) {
            var patternFlags = receiver.caseSensitive ? 'g' : 'gi',
              text = currentText;
            if (receiver.useRegexp) {
              try {
                if (receiver.wholeWord) {
                  text = `\\b${text.replace(/^\\b|\\b$/g, '')}\\b`;
                }
                searchPattern = new RegExp(text, patternFlags);
              } catch (error) {
                searchPattern = null;
              }
            } else {
              text = utilities.escapeRegExp(currentText.trim());
              if (receiver.wholeWord) {
                text = '\\b' + text + '\\b';
              }
              searchPattern = new RegExp(text, patternFlags);
            }
          }
          if (searchPattern) {
            searchPattern.lastIndex = 0;
          }
          return searchPattern;
        },
        streamIndex = fileNameOnly ? 1 : 0,
        isMac = File.getMountFolder(),
        streamHandlers = {
          begin: function (beginRecord) {
            if (File.isMac && isMac && 0 == beginRecord.path.text.indexOf(isMac)) {
              beginRecord.path.text = beginRecord.path.text
                .substring(isMac.length)
                .replace(/^[\/]/, '');
            }
            this.curFile[streamIndex] = { path: beginRecord.path.text, matches: [] };
          },
          end: function (endRecord) {
            var path = this.curFile[streamIndex].path;
            if (fileIntegration.isSupportedFile(path)) {
              if (fileNameOnly) {
                searchPattern = getSearchPattern();
                var separatorIndex = path.replace(/\\/g, '/').replace(/\/$/, '').lastIndexOf('/'),
                  fileName = path.substring(separatorIndex + 1) || path;
                if (!searchPattern.exec(fileName)) {
                  return void (this.curFile[streamIndex] = null);
                }
              }
              this.curFile[streamIndex].total = endRecord.stats.matches;
              renderFileResult.call(this, this.curFile[streamIndex]);
              this.curFile[streamIndex] = null;
            } else {
              this.curFile[streamIndex] = null;
            }
          },
          match: function (matchRecord) {
            this.curFile[streamIndex].matches.push({
              line: matchRecord.line_number,
              text: matchRecord.lines.text,
              submatches: matchRecord.submatches,
            });
          },
        },
        appendHighlightedText = function (innerText, targetElement) {
          if (innerText.trim() && !receiver.useRegexp) {
            var match = getSearchPattern().exec(innerText);
            if (match) {
              [
                innerText.substring(0, match.index),
                match[0],
                innerText.substring(match.index + match[0].length),
              ].forEach(function (inputInnerText, itemIndex) {
                var currentElement =
                  1 == itemIndex
                    ? document.createElement('span')
                    : document.createTextNode(inputInnerText);
                if (1 == itemIndex) {
                  currentElement.innerText = inputInnerText;
                  currentElement.classList.add('marklyra-file-search-match-text');
                }
                targetElement.appendChild(currentElement);
              });
            } else {
              targetElement.innerText = innerText;
            }
          } else {
            targetElement.innerText = innerText;
          }
        },
        renderFileResult = function (fileResult) {
          if (fileResult && fileResult.path) {
            var clonedNode = this.templateDom.cloneNode(true);
            clonedNode.dataset.path = File.getMountFolder() + pathSeparator + fileResult.path;
            var pathParts = (function (text) {
              var endOffset = text.replace(/\\/g, '/').replace(/\/$/, '').lastIndexOf('/'),
                textSlice = text.substring(endOffset + 1),
                currentTextSlice = text.substring(0, endOffset);
              endOffset = textSlice.lastIndexOf('.');
              var localTextSlice = textSlice.substring(endOffset);
              return [
                currentTextSlice,
                (textSlice = textSlice.substring(0, endOffset)),
                localTextSlice,
              ];
            })(fileResult.path);
            appendHighlightedText(
              pathParts[1],
              clonedNode.querySelector('.file-list-item-file-name-part'),
            );
            appendHighlightedText(
              pathParts[2],
              clonedNode.querySelector('.file-list-item-file-ext-part'),
            );
            var innerText = pathParts[0]
              ? (pathParts[0] + pathSeparator).replace(/[\\\/]/g, ' / ')
              : '';
            clonedNode.querySelector('.file-list-item-parent-loc').innerText = innerText;
            var matchCount = fileNameOnly ? 0 : fileResult.total;
            clonedNode.querySelector('.file-list-item-count').innerText =
              matchCount > 20 ? '20+' : matchCount;
            var previewLimit = 6;
            if (receiver.matchedLines < matchedLines && matchCount > previewLimit) {
              clonedNode.classList.add('marklyra-search-item-expand');
            }
            var currentElement = clonedNode.querySelector('.marklyra-search-item-matches');
            if (fileNameOnly) {
              (function () {
                receiver.matchedLines++;
                if (fileResult.matches.length) {
                  var divElement = document.createElement('div');
                  divElement.classList.add('marklyra-search-item-line');
                  var lineText = (fileResult.matches[0] || ['']).text.replace(/[\r\n]/g, '');
                  divElement.dataset.line = 0;
                  divElement.dataset.lineText = lineText;
                  if (lineText) {
                    appendResultContext(lineText, 0, lineText.length, divElement);
                  }
                  currentElement.appendChild(divElement);
                }
              })();
            } else {
              fileResult.matches.forEach(function (item, itemIndex) {
                receiver.matchedLines++;
                if (!(itemIndex > 20)) {
                  var divElement = document.createElement('div');
                  divElement.classList.add('marklyra-search-item-line');
                  if (itemIndex > previewLimit - 2) {
                    if (itemIndex == previewLimit - 1 && fileResult.matches.length > previewLimit) {
                      currentElement.appendChild(
                        (function (hiddenMatchCount) {
                          var currentDivElement = document.createElement('div');
                          currentDivElement.classList.add('marklyra-search-item-line');
                          currentDivElement.classList.add('marklyra-search-item-line-expand');
                          currentDivElement.innerText =
                            'show ' + hiddenMatchCount + ' more matches';
                          return currentDivElement;
                        })(fileResult.matches.length - itemIndex),
                      );
                    }
                    divElement.classList.add('marklyra-search-item-line-more');
                  }
                  item.text = item.text || '';
                  var lineText = item.text.replace(/[\r\n]/g, '');
                  divElement.dataset.line = item.line - 1;
                  divElement.dataset.lineText = lineText;
                  if (item.submatches.length) {
                    divElement.dataset.match = item.submatches[0].match.text;
                  }
                  for (
                    var match, consumedOffset = 0, linePattern = getSearchPattern();
                    (match = linePattern.exec(lineText));
                  ) {
                    if (consumedOffset < match.index) {
                      appendResultContext(lineText, 0, match.index, divElement, '', 0 == itemIndex);
                    }
                    consumedOffset = match.index + match[0].length;
                    appendResultContext(
                      lineText,
                      match.index,
                      consumedOffset,
                      divElement,
                      'marklyra-file-search-match-text',
                      true,
                    );
                  }
                  if (consumedOffset < lineText.length) {
                    appendResultContext(lineText, consumedOffset, lineText.length, divElement);
                  }
                  currentElement.appendChild(divElement);
                }
              });
            }
            var localElement = element.querySelector(
              "[data-path='" +
                utilities.escapeSelector(File.getMountFolder() + pathSeparator + fileResult.path) +
                "']",
            );
            if (fileNameOnly) {
              if (!localElement) {
                element.appendChild(clonedNode);
              }
            } else {
              if (localElement) {
                localElement.remove();
              }
              element.appendChild(clonedNode);
            }
          }
          function appendResultContext(
            inputInnerText,
            startOffset,
            endOffset,
            lineContainer,
            highlightClass,
            trimLeadingContext,
          ) {
            var spanElement = document.createElement('span');
            if (highlightClass) {
              spanElement.classList.add(highlightClass);
            }
            inputInnerText = inputInnerText.substring(startOffset, endOffset).replace(/\r*\n/, '');
            if (trimLeadingContext && 0 == startOffset) {
              inputInnerText = inputInnerText.replace(/^\s+/, '').replace(/\s+$/, ' ');
            }
            if (
              !fileNameOnly &&
              !highlightClass &&
              inputInnerText.length > 20 &&
              trimLeadingContext
            ) {
              inputInnerText =
                '...' +
                ((inputInnerText = inputInnerText.substring(
                  inputInnerText.length - 20,
                  inputInnerText.length,
                )).replace(/^.+?\b/, '') || inputInnerText);
            }
            spanElement.innerText = inputInnerText;
            lineContainer.appendChild(spanElement);
          }
        };
      if (fileResult) {
        if (!fileIntegration.isSupportedFile(inputText)) {
          return;
        }
        searchPattern = getSearchPattern();
        var separatorIndex = inputText.replace(/\\/g, '/').replace(/\/$/, '').lastIndexOf('/'),
          fileName = inputText.substring(separatorIndex + 1) || inputText;
        if (!searchPattern.exec(fileName)) {
          return;
        }
        renderFileResult.call(this, fileResult);
      } else {
        var parts = ((fileNameOnly ? this.pathPrev : this.prev) + inputText).split(/\r?\n/g);
        if (fileNameOnly) {
          this.pathPrev = parts.splice(parts.length - 1, 1)[0];
        } else {
          this.prev = parts.splice(parts.length - 1, 1)[0];
        }
        parts.forEach(function (item) {
          if (item && !(item.length > 1e4)) {
            try {
              var streamRecord = JSON.parse(item);
              if (streamHandlers[streamRecord.type]) {
                streamHandlers[streamRecord.type].call(this, streamRecord.data);
              }
            } catch (error) {
              console.warn(error);
            }
          }
        }, this);
        if ('' == inputText) {
          this.endCount--;
        }
        if (receiver.matchedLines > matchedLines) {
          jquery('.marklyra-search-item.marklyra-search-item-expand').removeClass(
            'marklyra-search-item-expand',
          );
        }
        if (!('' != inputText || element.childElementCount || this.endCount)) {
          this.curError = this.curError || jquery.localize.getString('No result found.', 'Front');
          this.onErrorMsg();
        }
      }
    }
    goto(line, searchValue, lineText) {
      this.editor.sourceView.gotoLine({
        line: line,
        ch: 0,
        lineText: lineText,
        textBefore: lineText.substring(0, lineText.indexOf(searchValue)),
      });
      this.editor.searchPanel.doSearch(searchValue, {
        caseSensitive: this.caseSensitive,
        wholeWord: this.wholeWord,
        useRegexp: this.useRegexp,
        noSelect: true,
        delay: 0,
        includeMeta: true,
      });
      var receiver = this,
        element = receiver.editor.getMarkElem(),
        tableRow = element.closest('tr');
      if (tableRow.length) {
        element = tableRow;
      }
      jquery('.md-search-select').removeClass('md-search-select');
      var firstHit = jquery();
      setTimeout(function () {
        (firstHit = element.find('.md-search-hit').first()).addClass('md-search-select');
        element.addClass('md-focus');
      }, 10);
      setTimeout(function () {
        if (firstHit.length) {
          receiver.editor.selection.scrollAdjust(firstHit, 60, void 0, true);
        }
      }, 200);
      document.querySelector('#file-library-search-input').focus();
    }
    search(queryText) {
      jquery('#file-library-search-result .select').removeClass('select');
      currentText = queryText;
      if (queryText) {
        if (!File.getMountFolder()) {
          return;
        }
        this.clearContentHighlight();
        this.parent.updateMenu('search');
        this.prev = '';
        this.curFile = [];
        this.curError = '';
        this.pathPrev = '';
        this.endCount = this.useRegexp ? 1 : 2;
        this.matchedLines = 0;
        if (File.isNode) {
          this.searchByNode(queryText);
        } else {
          this.searchByMac(queryText);
        }
      } else {
        jquery('#marklyra-sidebar')
          .removeClass('marklyra-on-search')
          .find('#file-library-search-result')
          .html('');
      }
    }
    searchByMac(text) {
      text = utilities.normalize(text);
      var normalizedPath = utilities.normalize(text, 'NFD');
      bridge.callHandler(
        'library.search',
        {
          text: text,
          caseSensitive: this.caseSensitive || false,
          wholeWord: this.wholeWord || false,
          useRegexp: this.useRegexp || false,
          args: this.buildRpArgs(text, normalizedPath),
        },
        (accepted) => {
          if (accepted) {
            jquery('#marklyra-sidebar')
              .addClass('marklyra-on-search')
              .find('#file-library-search-result')
              .html('');
          }
        },
      );
    }
    buildRpArgs(queryText, unusedParameter2) {
      var ripgrepArguments = [
        '-F',
        '--json',
        '--no-multiline',
        '-n',
        '-m',
        '21',
        '--max-filesize',
        '2M',
        '-g',
        '!.*',
        '--no-messages',
        '--',
        queryText,
      ];
      if (this.useRegexp) {
        ripgrepArguments.shift();
      }
      if (!this.caseSensitive) {
        ripgrepArguments.unshift('-i');
      }
      if (this.wholeWord) {
        ripgrepArguments.unshift('-w');
      }
      return ripgrepArguments;
    }
    searchByNode(inputNormalizedPath, unusedParameter2) {
      var receiver = this;
      if (receiver.rpTask1) {
        receiver.rpTask1.kill();
        receiver.rpTask1 = null;
      }
      if (receiver.rpTask2) {
        receiver.rpTask2.kill();
        receiver.rpTask2 = null;
      }
      if (receiver.rpTask3) {
        receiver.rpTask3.kill();
        receiver.rpTask3 = null;
      }
      inputNormalizedPath = utilities.normalize(inputNormalizedPath);
      var rpTask1,
        normalizedPath = utilities.normalize(inputNormalizedPath, 'NFD');
      function spawnRipgrep(argumentsList) {
        var childProcess = reqnode('child_process'),
          ripgrepPath = reqnode('vscode-ripgrep').rgPath.replace(
            'node_modules.asar',
            'node_modules',
          ),
          searchProcess = childProcess.spawn(ripgrepPath, argumentsList, {
            cwd: File.getMountFolder(),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        searchProcess.stdout.setEncoding('utf8');
        searchProcess.stderr.setEncoding('utf8');
        return searchProcess;
      }
      jquery('#marklyra-sidebar')
        .addClass('marklyra-on-search')
        .find('#file-library-search-result')
        .html('');
      (function () {
        if (!receiver.useRegexp) {
          var fileGlob = '*' + utilities.escapeRegExp(inputNormalizedPath) + '*',
            rpTask2 = spawnRipgrep([
              '-m',
              '2',
              '--max-filesize',
              '2M',
              '.*',
              '-H',
              '-U',
              '--json',
              '--no-messages',
              receiver.caseSensitive ? '-g' : '--iglob',
              fileGlob,
            ]);
          rpTask2.stdout.on('data', function (outputChunk) {
            receiver.onSearchUpdate(outputChunk, true);
          });
          rpTask2.on('close', function () {
            receiver.onSearchUpdate('', true);
            receiver.rpTask2 = null;
          });
          receiver.rpTask2 = rpTask2;
        }
      })();
      (rpTask1 = spawnRipgrep(receiver.buildRpArgs(inputNormalizedPath, normalizedPath))).stdout.on(
        'data',
        function (outputChunk) {
          receiver.onSearchUpdate(outputChunk);
        },
      );
      rpTask1.on('close', function () {
        receiver.onSearchUpdate('');
        receiver.rpTask1 = null;
      });
      rpTask1.stderr.on('data', function (curError) {
        receiver.curError += curError;
      });
      receiver.rpTask1 = rpTask1;
      (function () {
        if (!receiver.useRegexp) {
          var fileGlob = '*' + utilities.escapeRegExp(inputNormalizedPath) + '*',
            rpTask3 = spawnRipgrep([
              '--max-filesize',
              '0K',
              '--files',
              '--no-messages',
              receiver.caseSensitive ? '-g' : '--iglob',
              fileGlob,
            ]);
          rpTask3.stdout.on('data', function (text) {
            text.split(/\r?\n/g).map(function (path) {
              receiver.onSearchUpdate(path, true, { path: path, matches: [] });
            });
          });
          rpTask3.on('close', function () {
            receiver.rpTask3 = null;
          });
          receiver.rpTask3 = rpTask3;
        }
      })();
    }
  };
}
