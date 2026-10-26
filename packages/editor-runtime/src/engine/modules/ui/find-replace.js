// ui/find-replace.
export default function initializeUiFindReplace(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(markSearchRange, 'name', { value: 'f', configurable: true });
  Object.defineProperty(restoreInitialSearchPosition, 'name', { value: 'm', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    rangy = requireModule('libraries/rangy'),
    keyboardShortcuts = requireModule('editing/keyboard-shortcuts'),
    CodeMirror = requireModule('libraries/codemirror'),
    documentModel = (requireModule('model/markdown-parser'), requireModule('model/document-model')),
    inlineDecoration = requireModule('render/inline-decoration'),
    dialogs = requireModule('ui/dialogs'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    MAX_HITS_COUNT = 5e3;
  var timerId = null;
  function markSearchRange(matchRange) {
    return dialogs.markRange(matchRange, 'md-search-hit');
  }
  function restoreInitialSearchPosition(searchState) {
    try {
      if (searchState) {
        var initPos = searchState.initPos;
        if (!initPos && searchState.curSelection) {
          if (searchState.curSelection.isCm) {
            initPos = searchState.curSelection;
          } else {
            var range = rangy.createRange(),
              domNode = searchState.curSelection;
            if (!domNode.parentElement) {
              return;
            }
            range.selectNode(domNode);
            if ((domNode = $(domNode).closest('[cid]')[0])) {
              initPos = range.getBookmark(domNode);
            }
            if (initPos) {
              initPos.cid = domNode.getAttribute('cid');
            }
          }
        }
        return initPos || null;
      }
    } catch (error) {}
    return null;
  }
  moduleRecord.exports = class {
    constructor(inputEditor) {
      this.editor = inputEditor;
      this.curSel = null;
      this.searchTimer;
      this.caseSensitive = File.option.caseSensitive;
      this.wholeWord = File.option.wholeWord;
      this.useRegexp = File.option.useRegexp;
      this.bindEvents();
      this.MAX_HITS_COUNT = MAX_HITS_COUNT;
    }
    bindEvents() {
      var currentTimerId,
        receiver = this,
        composing = false,
        map = keyboardShortcuts.map;
      if (!File.isMac && !File.isNode) {
        keyboardShortcuts('command+f, ctrl+f', function (event) {
          receiver.showPanel();
          event.preventDefault();
        });
      }
      if (!File.isMac && !File.isNode) {
        keyboardShortcuts('command+h, ctrl+h', function (event) {
          receiver.showPanel(true);
          event.preventDefault();
        });
      }
      $(document.body)
        .on('keydown', function (keyboardEvent) {
          if ('Escape' == keyboardEvent.key && receiver.isOpen()) {
            receiver.closePanel();
            return false;
          }
        })
        .on('mouseup', '.md-search-hit', function () {
          receiver.closePanel(false, $(this));
        })
        .on('mouseup', '.cm-search-hit', function (pointerEvent) {
          var currentCodeMirror = $(pointerEvent.target).closest('.CodeMirror')[0].CodeMirror,
            mousePosition = CodeMirror.posFromMouse(currentCodeMirror, pointerEvent),
            start = currentCodeMirror.indexFromPos(mousePosition),
            elements = receiver.searchStatus.hits.find(function (item) {
              return item.isCm == currentCodeMirror && item.start <= start && item.end >= start;
            });
          receiver.closePanel(true);
          if (elements) {
            currentCodeMirror.doc.setSelection(
              currentCodeMirror.posFromIndex(elements.start),
              currentCodeMirror.posFromIndex(elements.end),
            );
            return false;
          }
        })
        .on('mouseup', '.CodeMirror', function (unusedParameter1) {
          receiver.closePanel(true);
        });
      $('#md-searchpanel')
        .on('blur', function () {
          receiver.closePanel();
        })
        .on('click', '.close-btn', function () {
          receiver.closePanel();
        })
        .on('keydown', 'input', function (keyboardEvent) {
          if ('Escape' == keyboardEvent.key) {
            receiver.closePanel();
            return false;
          }
        })
        .on('keydown', '#search-panel-input', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Enter' == map[keyCode]) {
            if ($(this).val() == receiver.searchStatus.searchText) {
              receiver.highlightNext(keyboardEvent.shiftKey);
            } else {
              receiver.doSearch($(this).val());
            }
            return false;
          } else {
            if ('Tab' == map[keyCode]) {
              if ($('#md-searchpanel.searchpanel-replace-mode').length) {
                $('#search-panel-replace-input').focus();
                return false;
              } else {
                this.value += '\t';
                return false;
              }
            } else {
              return void 0;
            }
          }
        })
        .on('beforeinput', '#search-panel-input', function (unusedParameter1) {
          if (currentTimerId) {
            clearTimeout(currentTimerId);
          }
          currentTimerId = null;
        })
        .on('input', '#search-panel-input', function (unusedParameter1) {
          if (!composing) {
            if (currentTimerId) {
              clearTimeout(currentTimerId);
            }
            currentTimerId = null;
            receiver.doSearch($(this).val());
          }
        })
        .on('compositionstart', '#search-panel-input', function (unusedParameter1) {
          composing = true;
        })
        .on('compositionend', '#search-panel-input', function (unusedParameter1) {
          composing = false;
          var currentReceiver = this;
          if (currentTimerId) {
            clearTimeout(currentTimerId);
          }
          currentTimerId = setTimeout(() => {
            if (!composing) {
              receiver.doSearch(currentReceiver.value);
            }
            currentTimerId = null;
          }, 100);
        })
        .on('keydown', '#search-panel-replace-input', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ((composing = 229 == keyCode) || 'Enter' != map[keyCode]) {
            if ('Tab' == map[keyCode] && !keyboardEvent.shiftKey) {
              return false;
            }
          } else {
            receiver.replaceSelection();
          }
        })
        .on('mousedown', '#search-panel-prev', function () {
          receiver.highlightNext(true);
        })
        .on('mousedown', '#search-panel-next', function () {
          receiver.highlightNext();
        })
        .on('click', '#md-search-type-label', function () {
          $('#md-searchpanel').addClass('searchpanel-replace-mode');
          $('#search-panel-replace-input').focus();
          document.body.classList.add('on-replace-panel-open');
        })
        .on('click', '#md-replace-type-label', function () {
          $('#md-searchpanel')
            .removeClass('searchpanel-replace-mode')
            .removeClass('searchpanel-msg-mode');
          $('#search-panel-input').focus();
          document.body.classList.remove('on-replace-panel-open');
          $('content').removeClass('on-replace-panel-open');
        })
        .on('click', '#search-panel-replace-btn', function () {
          receiver.replaceSelection();
          $('#md-searchpanel').removeClass('searchpanel-msg-mode');
        })
        .on('click', '#search-panel-replaceall-btn', function () {
          $('#md-searchpanel').removeClass('searchpanel-msg-mode');
          receiver.replaceAll();
        })
        .on('click', '#searchpanel-msg-close-btn', function () {
          $('#md-searchpanel').removeClass('searchpanel-msg-mode');
        })
        .on('click', '#searchpanel-msg-undo-btn', function () {
          receiver.editor.undo.undo();
          $('#md-searchpanel').removeClass('searchpanel-msg-mode');
          if (!receiver.editor.sourceView.inSourceMode) {
            receiver.doSearch($('#search-panel-input').val());
          }
        })
        .on('mousedown', '#searchpanel-regexp-option-btn', function (unusedParameter1) {
          this.classList.toggle('active');
          receiver.useRegexp = !receiver.useRegexp;
          if (File.isMac) {
            bridge.callHandler('touchBar.updateFindReplaceMode', [
              !!receiver.caseSensitive,
              !!receiver.wholeWord,
            ]);
          }
          JSBridge.putSetting('useRegexp', receiver.useRegexp);
          receiver.doSearch();
          return false;
        })
        .on('mousedown', '#searchpanel-case-option-btn', function (unusedParameter1) {
          this.classList.toggle('active');
          receiver.caseSensitive = !receiver.caseSensitive;
          if (File.isMac) {
            bridge.callHandler('touchBar.updateFindReplaceMode', [
              !!receiver.caseSensitive,
              !!receiver.wholeWord,
            ]);
          }
          JSBridge.putSetting('caseSensitive', receiver.caseSensitive);
          receiver.doSearch();
          return false;
        })
        .on('mousedown', '#searchpanel-word-option-btn', function () {
          this.classList.toggle('active');
          receiver.wholeWord = !receiver.wholeWord;
          if (File.isMac) {
            bridge.callHandler('touchBar.updateFindReplaceMode', [
              !!receiver.caseSensitive,
              !!receiver.wholeWord,
            ]);
          }
          JSBridge.putSetting('wholeWord', receiver.wholeWord);
          receiver.doSearch();
          return false;
        });
      if (receiver.wholeWord) {
        document.querySelector('#searchpanel-word-option-btn').classList.add('active');
      }
      if (receiver.caseSensitive) {
        document.querySelector('#searchpanel-case-option-btn').classList.add('active');
      }
      if (receiver.useRegexp) {
        document.querySelector('#searchpanel-regexp-option-btn').classList.add('active');
      }
    }
    replaceAll() {
      Object.defineProperty(replaceNodeAttribute, 'name', { value: 'w', configurable: true });
      Object.defineProperty(replaceNodeWithHistory, 'name', { value: 'x', configurable: true });

      if (this.searchStatus && this.searchStatus.hits.length) {
        var startOffset,
          currentHitsLength,
          searchText = this.searchStatus.searchText,
          replacementText = $('#search-panel-replace-input').val(),
          hits = this.searchStatus.hits;
        (function (statusMessage) {
          if (timerId) {
            clearTimeout(timerId);
          }
          $('#md-searchpanel.searchpanel-replace-mode')
            .addClass('searchpanel-msg-mode')
            .find('#searchpanel-msg-content')
            .text(statusMessage);
          timerId = setTimeout(function () {
            $('#md-searchpanel').removeClass('searchpanel-msg-mode');
          }, 5e3);
        }).call(
          this,
          ((currentHitsLength = this.searchStatus.hits.length),
          this.searchStatus.searchText,
          'Replaced ' + currentHitsLength + ' occurrence(s)'),
        );
        if (this.editor.sourceView.inSourceMode) {
          var replacedText = '',
            itemIndex = 0,
            hitsLength = hits.length;
          startOffset = 0;
          searchText = this.editor.sourceView.cm.getValue();
          if (this.searchStatus.useRegexp) {
            replacedText = searchText.replace(this.searchStatus.regexp, replacementText);
          } else {
            for (; itemIndex < hitsLength; itemIndex++) {
              replacedText =
                replacedText +
                searchText.substring(startOffset, hits[itemIndex].start - 0) +
                replacementText;
              startOffset = hits[itemIndex].end - 0;
            }
            replacedText += searchText.substring(startOffset);
          }
          var top = this.editor.sourceView.cm.getScrollInfo().top;
          this.editor.sourceView.cm.setValue(replacedText);
          this.editor.sourceView.cm.scrollTo(0, top);
          return void this.clearSearch();
        }
        var UndoManager = this.editor.undo.UndoManager,
          replaceAllCommand = UndoManager.makeEmptyCommand(),
          searchStatus = this.searchStatus,
          regexp = searchStatus.regexp;
        this.editor.undo.endSnap(true);
        var previousNodeId,
          domNode = this.searchStatus.curSelection;
        if (domNode && domNode.isCm) {
          replaceAllCommand.undo.push({
            cid: domNode.cid,
            start: domNode.start,
            end: domNode.end,
            type: 'cursor',
          });
        } else {
          if (domNode && domNode.parentElement) {
            var range = rangy.createRange();
            range.selectNode(domNode);
            replaceAllCommand.undo.push(this.editor.selection.buildUndo(range));
          }
        }
        for (this.resetSearchStatus(), itemIndex = 0; itemIndex < hits.length; itemIndex++) {
          var hitNodeId =
            (startOffset = hits[itemIndex]).isCm || startOffset.isFutureCm
              ? startOffset.cid
              : $(startOffset).closest('[cid]').attr('cid');
          if (previousNodeId != hitNodeId) {
            previousNodeId = hitNodeId;
            replaceNodeWithHistory.call(this, hitNodeId);
          }
        }
        this.editor.undo.register(replaceAllCommand);
      }
      function replaceNodeAttribute(documentNode, attributeName) {
        var currentText = documentNode.get(attributeName);
        regexp.lastIndex = 0;
        if (currentText) {
          var text = currentText;
          text = searchStatus.useRegexp
            ? currentText.replace(regexp, replacementText)
            : currentText.replace(regexp, function () {
                return replacementText;
              });
          documentNode.set(attributeName, text);
        }
      }
      function replaceNodeWithHistory(nodeId) {
        var documentNode = this.editor.getNode(nodeId);
        replaceAllCommand.undo.push(UndoManager.buildReplaceUndo(documentNode));
        replaceNodeAttribute(documentNode, 'text');
        replaceNodeAttribute(documentNode, 'title');
        replaceNodeAttribute(documentNode, 'ref');
        replaceAllCommand.redo.push(UndoManager.buildReplaceUndo(documentNode));
        var nodeElement = this.editor.findElemById(documentNode.cid);
        if (documentNode.get('type') == NodeType.fences) {
          var intersectionObserver = this.editor.fences.intersectionObserver;
          if (intersectionObserver) {
            intersectionObserver.unobserve(nodeElement[0]);
          }
        }
        nodeElement.replaceWith(documentNode.toHTML());
        if (documentNode.get('type') == NodeType.fences) {
          this.editor.fences.intersectionObserve(this.editor.findElemById(documentNode.cid)[0]);
        }
      }
    }
    replaceSelection() {
      if (this.editor.sourceView.inSourceMode && !this.searchStatus.curSelection) {
        this.highlightNext();
      }
      if (
        this.searchStatus &&
        this.searchStatus.hits &&
        this.searchStatus.hits.length &&
        $('#md-searchpanel.searchpanel-replace-mode').length
      ) {
        if (this.searchStatus.curSelection) {
          var replacementText = $('#search-panel-replace-input').val(),
            curPos = this.searchStatus.curPos,
            replaceCommand = this.editor.undo.UndoManager.makeEmptyCommand(),
            curSelection = this.searchStatus.curSelection,
            isCm = curSelection.isCm;
          this.editor.undo.endSnap(true);
          if (isCm) {
            if (this.searchStatus.useRegexp) {
              isCm.doc.replaceSelection(
                isCm.doc.getSelection().replace(this.searchStatus.regexp, replacementText),
                'start',
                '+findReplace',
              );
            } else {
              isCm.doc.replaceSelection(replacementText, 'start', '+findReplace');
            }
            (function (searchState) {
              for (
                var followingHit,
                  itemIndex = curPos + 1,
                  start = replacementText.length - (curSelection.end - curSelection.start);
                (followingHit = searchState.hits[itemIndex]);
              ) {
                if (!followingHit.isCm || followingHit.isCm.cid != isCm.cid) {
                  return;
                }
                followingHit.start += start;
                followingHit.end += start;
                itemIndex++;
              }
            })(this.searchStatus);
          } else {
            (function (editor, domNode, text, replaceCommand, replacementPattern) {
              editor.brush.pause();
              var UndoManager = editor.undo.UndoManager,
                documentNode = editor.nodeMap.allNodes.get($(domNode).closest('[cid]').attr('cid'));
              if (!DocumentNode.isType(documentNode, NodeType.html_block)) {
                var range = rangy.createRange();
                range.selectNode(domNode);
                var originalSelection = editor.selection.buildUndo(range),
                  updatedSelection = Object.clone(originalSelection);
                if (replacementPattern) {
                  var currentText = domNode.rawText();
                  if (replacementPattern.source.indexOf('(?') > -1) {
                    var searchValue = (domNode.previousSibling || {}).textContent || '',
                      followingText = (domNode.nextSibling || {}).textContent || '',
                      localText = (searchValue + currentText + followingText).replace(
                        replacementPattern,
                        text,
                      );
                    text =
                      0 === localText.indexOf(searchValue) &&
                      localText.lastIndexOf(followingText) ==
                        localText.length - followingText.length
                        ? localText.substring(
                            searchValue.length,
                            localText.length - followingText.length,
                          )
                        : currentText.replace(replacementPattern, text);
                  } else {
                    text = currentText.replace(replacementPattern, text);
                  }
                }
                updatedSelection.end =
                  updatedSelection.end + text.length - domNode.textContent.length;
                replaceCommand.undo.push(originalSelection);
                replaceCommand.undo.push(UndoManager.buildReplaceUndo(documentNode));
                var currentElement,
                  replacementNode = null;
                if (domNode.nextSibling && 'SCRIPT' == domNode.nextSibling.tagName) {
                  domNode.nextSibling.textContent = text + domNode.nextSibling.textContent;
                } else {
                  if (domNode.previousSibling && 'SCRIPT' == domNode.previousSibling.tagName) {
                    domNode.previousSibling.textContent =
                      domNode.previousSibling.textContent + text;
                  } else {
                    replacementNode = document.createTextNode(text);
                    domNode.parentElement.insertBefore(replacementNode, domNode);
                    currentElement = domNode.parentElement;
                  }
                }
                domNode.remove();
                var src,
                  element = currentElement && currentElement.closest('.md-image');
                if (element) {
                  if ('img' == element.getAttribute('md-inline')) {
                    src =
                      (/(^\!\[((?:\[[^\]]*\]|[^\[\]])*)\]\()(<?((?:\([^)]*\)|[^()])*?)>?[ \t]*((['"])((?:.|\n)*?)\6[ \t]*)?)(\)(?:\s*{([^{}\(\)]*)})?)/.exec(
                        element.textContent,
                      ) || [])[4];
                  }
                  if ('imgtag' == element.getAttribute('md-inline')) {
                    if (
                      !(src = (/src\s*=\s*(['"])((.|\n)*?)\1/.exec(element.textContent) || [])[2])
                    ) {
                      src = (/src\s*=\s*([^\s'"]+)(\s|$)/.exec(element.textContent) || [])[1];
                    }
                  }
                  if (src) {
                    element.dataset.src = src;
                    element.querySelector('img').src = editor.imgEdit.getRealSrc(src, void 0, true);
                  }
                }
                editor.store(documentNode.cid);
                replaceCommand.redo.push(UndoManager.buildReplaceUndo(documentNode));
                editor.brush.addToQueue(documentNode.cid);
                if (replacementNode) {
                  range.selectNode(replacementNode);
                  replaceCommand.redo.push(editor.selection.buildUndo(range));
                } else {
                  replaceCommand.redo.push(updatedSelection);
                }
              }
            })(
              editor,
              curSelection,
              replacementText,
              replaceCommand,
              this.searchStatus.useRegexp ? this.searchStatus.regexp : null,
            );
          }
          if (this.searchStatus.hits.length > 1) {
            this.highlightNext();
          }
          this.searchStatus.hits.splice(curPos, 1);
          if (this.searchStatus.curPos > 0) {
            this.searchStatus.curPos--;
          }
          if (!this.searchStatus.hits.length) {
            this.clearSearch();
          }
          if (!this.editor.sourceView.inSourceMode) {
            this.editor.undo.register(replaceCommand);
          }
        } else {
          this.highlightNext();
        }
      }
    }
    isOpen() {
      return 'block' == document.querySelector('#md-searchpanel').style.display;
    }
    showPanel(replaceMode, selectFirstMatch) {
      document.body.classList.remove('marklyra-show-notification');
      var element = document.querySelector('#search-panel-input');
      if (this.isOpen()) {
        element.focus();
        element.select();
      } else {
        var selectionRange = editor.selection.getRangy();
        editor.lastCursor = editor.selection.buildUndo(selectionRange);
        $('.md-search-select').removeClass('md-search-select');
        this.clearSearch();
        this.searchStatus.initPos = editor.selection.getPosBookmark(selectionRange);
        $('#md-searchpanel').show();
        var codeMirrorElement =
          document.activeElement && document.activeElement.closest('.CodeMirror');
        if (codeMirrorElement) {
          element.value = codeMirrorElement.CodeMirror.getSelection();
        }
        if (selectionRange && !selectionRange.collapsed) {
          element.value = selectionRange.toString();
        }
        element.focus();
        element.select();
        if (element.value) {
          this.doSearch(element.value, {
            caseSensitive: $('#searchpanel-case-option-btn.active').length,
            wholeWord: $('#searchpanel-word-option-btn.active').length,
            useRegexp: $('#searchpanel-regexp-option-btn.active').length,
            noSelect: !selectFirstMatch,
          });
        }
        document.body.classList.add('on-search-panel-open');
      }
      if (replaceMode) {
        $('#md-searchpanel').addClass('searchpanel-replace-mode');
        document.body.classList.add('on-replace-panel-open');
      } else {
        $('#md-searchpanel').removeClass('searchpanel-replace-mode');
        document.body.classList.remove('on-replace-panel-open');
      }
      if (File.isMac) {
        bridge.callHandler('touchBar.showFindReplaceTouchBar');
        bridge.callHandler('touchBar.updateFindReplaceMode', [
          !!this.caseSensitive,
          !!this.wholeWord,
        ]);
      }
    }
    closePanel(skipSelectionRestore, selectedElements) {
      selectedElements = selectedElements || $('.md-search-select');
      this.editor.brush.resume();
      var length = this.editor.getMarkElem().length;
      document.body.classList.remove('on-replace-panel-open');
      document.body.classList.remove('on-search-panel-open');
      var element = document.querySelector('#file-library-search-result .select');
      if (element) {
        element.classList.remove('select');
      }
      $('#md-searchpanel').removeClass('searchpanel-msg-mode').hide();
      if (this.editor.sourceView.inSourceMode) {
        if (this.searchStatus && this.searchStatus.hits.length) {
          this.editor.fences.clearSearchAll();
          this.editor.sourceView.cm.focus();
        }
        return void this.resetSearchStatus();
      }
      if (skipSelectionRestore) {
        length = true;
      } else {
        if (selectedElements.length) {
          this.editor.selection.selectAllElem(selectedElements);
          this.editor.lastCursor = this.editor.selection.buildUndo();
          length = false;
        } else {
          if (
            this.searchStatus &&
            this.searchStatus.curSelection &&
            this.searchStatus.curSelection.isCm
          ) {
            this.searchStatus.curSelection.isCm.focus();
            this.editor.lastCursor = this.editor.selection.buildUndo();
            length = false;
          }
        }
      }
      $('.md-search-select').removeClass('md-search-select');
      this.editor.mathInline.renderAll(false);
      this.clearSearch();
      $('.md-search-hit').removeClass('md-search-hit');
      if (!length) {
        this.editor.restoreLastCursor();
      }
      if (!skipSelectionRestore) {
        this.editor.refocus();
      }
    }
    updateIndexUI() {
      var element = document.querySelector('#search-panel-status');
      if (!this.searchStatus.searchText) {
        element.textContent = '';
        return void (element.textContent = '');
      }
      var hitsLength = this.searchStatus.hits.length,
        curPos = this.searchStatus.curPos;
      if (hitsLength > MAX_HITS_COUNT) {
        this.clearSearch(false, false, true);
        element.innerHTML = `<span marklyra-hint="${$.localize.getString('Too many matches', 'Front')}" class="error-message">${MAX_HITS_COUNT}+</span>`;
      } else {
        if (hitsLength) {
          element.textContent = `${curPos + 1} / ${hitsLength}`;
        } else {
          element.innerHTML = `<span class="error-message">${$.localize.getString('No Results', 'Front')}</span>`;
        }
      }
    }
    doSearch(queryText, searchOptions) {
      var currentEditor = this.editor,
        receiver = this,
        searchStatus = this.searchStatus,
        initPos = searchStatus && restoreInitialSearchPosition(searchStatus),
        initPosContainer = initPos && document.querySelector("[cid='" + initPos.cid + "']"),
        resolvedOptions = searchOptions;
      if (!searchOptions) {
        resolvedOptions = {
          caseSensitive: $('#searchpanel-case-option-btn.active').length,
          wholeWord: $('#searchpanel-word-option-btn.active').length,
          useRegexp: $('#searchpanel-regexp-option-btn.active').length,
        };
      }
      (resolvedOptions = Object.assign(
        {
          caseSensitive: false,
          wholeWord: false,
          useRegexp: false,
          noSelect: false,
          delay: File.inBusyMode ? 400 : 50,
        },
        resolvedOptions,
      )).initPosContainer = initPosContainer;
      resolvedOptions.initPos = initPos;
      resolvedOptions.searchText =
        void 0 === queryText ? $('#search-panel-input').val() : queryText || '';
      if (
        (searchStatus = Object.assign(this.emptySearchStatus(), resolvedOptions)).searchText.length
      ) {
        receiver = this;
        searchStatus.regexp = (function (text, searchOptions) {
          var patternFlags = searchOptions.caseSensitive ? 'g' : 'gi';
          if (!searchOptions.useRegexp) {
            var escapedQuery = utilities.escapeRegExp(text);
            if (searchOptions.wholeWord) {
              escapedQuery = `\\b${escapedQuery}\\b`;
            }
            return new RegExp(escapedQuery, patternFlags);
          }
          try {
            if (searchOptions.wholeWord) {
              text = `\\b${text.replace(/^\\b|\\b$/g, '')}\\b`;
            }
            return new RegExp(text, patternFlags);
          } catch (error) {
            console.debug(error);
            return null;
          }
        })(searchStatus.searchText, searchStatus);
        if (null == searchStatus.regexp) {
          return void this.updateIndexUI();
        }
        if (this.searchTimer) {
          clearTimeout(this.searchTimer);
          this.searchTimer = null;
        }
        this.searchTimer = setTimeout(function () {
          if (receiver.editor.sourceView.inSourceMode) {
            receiver.clearSearch(void 0, true);
            receiver.searchStatus = searchStatus;
            receiver.findAtNode(
              receiver.editor.sourceView.cm,
              searchStatus.searchText,
              searchStatus,
              true,
            );
            return void (!resolvedOptions.noSelect && receiver.highlightNext());
          }
          receiver.clearSearch(void 0, true);
          $('.md-search-expand').removeClass('md-search-expand');
          receiver.searchStatus = searchStatus;
          for (var documentNode = currentEditor.nodeMap.getFirst(); documentNode; ) {
            receiver.findAtNode(
              documentNode,
              searchStatus.searchText,
              searchStatus,
              false,
              resolvedOptions.includeMeta,
            );
            documentNode = documentNode.get('after');
            if (searchStatus.hits.length > MAX_HITS_COUNT) {
              return void receiver.updateIndexUI();
            }
          }
          if (resolvedOptions.noSelect) {
            receiver.updateIndexUI();
          } else {
            receiver.highlightNext();
          }
        }, resolvedOptions.delay);
      } else {
        $('.md-search-expand').removeClass('md-search-expand');
        this.clearSearch(void 0, true);
        this.searchStatus = searchStatus;
        this.updateIndexUI();
      }
    }
    findAtNode(rootNode, queryText, searchState, sourceMode, includeMetadata) {
      Object.defineProperty(isHitBeforeInitialPosition, 'name', { value: 'c', configurable: true });
      Object.defineProperty(expandSearchMetadata, 'name', { value: 'p', configurable: true });
      Object.defineProperty(searchRenderedNode, 'name', { value: 'm', configurable: true });
      Object.defineProperty(searchCodeMirror, 'name', { value: 'g', configurable: true });

      var currentEditor = this.editor,
        initPosContainer = searchState.initPosContainer,
        initPos = searchState.initPos;
      function isHitBeforeInitialPosition(hit) {
        var hitContainer = hit.containerNode || document.querySelector("[cid='" + hit.cid + "']");
        return (
          !!initPosContainer &&
          (initPosContainer.compareDocumentPosition(hitContainer) ==
            Element.DOCUMENT_POSITION_PRECEDING ||
            (initPosContainer == hitContainer && hit.start < initPos.start))
        );
      }
      function expandSearchMetadata(matchElement) {
        var element = $(matchElement);
        if (
          element.closest('.md-meta, .md-content, script').length ||
          element.hasClass('md-meta') ||
          element.hasClass('md-content') ||
          (element[0] && 'script' == element[0].tagName)
        ) {
          element.closest('[md-inline]').addClass('md-search-expand');
        } else {
          matchElement.querySelectorAll('.md-meta, .md-content, script').forEach(function (item) {
            $(item).closest('[md-inline]').addClass('md-search-expand');
          });
        }
      }
      function searchRenderedNode(documentNode, unusedParameter2, futureCodeMirror) {
        var regexp = searchState.regexp,
          containerNode = currentEditor.findElemById(documentNode.cid)[0];
        if (containerNode) {
          var matchRange,
            matchBookmark,
            searchableText = $(containerNode).rawText(),
            lastIndex = 0;
          if (includeMetadata && DocumentNode.isType(documentNode, NodeType.heading)) {
            var headingPrefix = '#'.repeat(documentNode.get('depth') || 1) + ' ';
            searchableText = headingPrefix + searchableText;
            lastIndex = headingPrefix.length;
          }
          var modelText = documentNode.getText().replace(/\r?\n/g, File.useCRLF ? '\r\n' : '\n');
          searchableText = futureCodeMirror ? modelText : searchableText;
          regexp.lastIndex = 0;
          for (var regexpMatch = null; (regexpMatch = regexp.exec(searchableText)); ) {
            if (
              (matchBookmark = {
                cid: documentNode.cid,
                containerNode: containerNode,
                start: Math.max(0, regexp.lastIndex - regexpMatch[0].length - lastIndex),
                end: regexp.lastIndex - lastIndex,
              }).start == matchBookmark.end
            ) {
              return;
            }
            if (futureCodeMirror) {
              searchState.hits.push({
                isFutureCm: documentNode.cid,
                cid: documentNode.cid,
                start: matchBookmark.start,
                end: matchBookmark.end,
              });
            } else {
              (matchRange = matchRange || rangy.createRange()).moveToBookmark(matchBookmark);
              var highlightElement = markSearchRange(matchRange);
              expandSearchMetadata(highlightElement);
              searchState.hits.push(highlightElement);
            }
            if (isHitBeforeInitialPosition(matchBookmark)) {
              searchState.curPos++;
            }
            if (searchState.hits.length > MAX_HITS_COUNT) {
              return;
            }
          }
        } else {
          try {
            console.sendError(
              'cannot found elem for [' +
                documentNode.get('type') +
                '] from [' +
                documentNode.get('parent').get('type') +
                ']',
            );
          } catch (error) {}
        }
      }
      function searchCodeMirror(isCm, queryText) {
        var regexp = searchState.regexp,
          text = isCm.getValue(),
          foundMatch = false,
          matchRecord = null;
        regexp.lastIndex = 0;
        for (var regexpMatch = null; (regexpMatch = regexp.exec(text)); ) {
          foundMatch = true;
          if (
            (matchRecord = {
              isCm: isCm,
              cid: isCm.cid,
              start: regexp.lastIndex - regexpMatch[0].length,
              end: regexp.lastIndex,
            }).start == matchRecord.end
          ) {
            return;
          }
          searchState.hits.push(matchRecord);
          if (isHitBeforeInitialPosition(matchRecord)) {
            searchState.curPos++;
          }
          if (searchState.hits.length > MAX_HITS_COUNT) {
            return;
          }
        }
        if (foundMatch) {
          currentEditor.fences.searchOn(isCm, queryText, searchState);
        }
      }
      if (sourceMode) {
        searchCodeMirror(this.editor.sourceView.cm, queryText);
      } else {
        Object.defineProperty(
          function searchDocumentSubtree(documentNode, queryText) {
            if (documentNode.get('children').length) {
              documentNode.get('children').sortedForEach(function (childNode) {
                searchDocumentSubtree(childNode, queryText);
              });
            } else {
              if (DocumentNode.isType(documentNode, NodeType.fences)) {
                if (currentEditor.fences.queue[documentNode.cid]) {
                  searchCodeMirror(currentEditor.fences.queue[documentNode.cid], queryText);
                } else {
                  var regexp = searchState.regexp;
                  try {
                    !(function (fenceNode, unusedParameter2) {
                      searchRenderedNode(fenceNode, 0, true);
                    })(documentNode);
                  } catch (error) {
                    console.error(error);
                  }
                  regexp.lastIndex = 0;
                }
              } else {
                if (DocumentNode.isType(documentNode, NodeType.math_block)) {
                  if ((currentEditor.mathBlock.currentCm || {}).cid === documentNode.cid) {
                    currentEditor.fences.clearSearchOn(currentEditor.mathBlock.currentCm);
                    searchCodeMirror(currentEditor.mathBlock.currentCm, queryText);
                  }
                } else {
                  if (!DocumentNode.isType(documentNode, NodeType.toc, NodeType.hr)) {
                    if (DocumentNode.isType(documentNode, NodeType.html_block)) {
                      if ((currentEditor.htmlBlock.currentCm || {}).cid === documentNode.cid) {
                        currentEditor.fences.clearSearchOn(currentEditor.htmlBlock.currentCm);
                        searchCodeMirror(currentEditor.htmlBlock.currentCm, queryText);
                      } else {
                        (function (htmlNode, unusedParameter2) {
                          var range,
                            matchRecord,
                            currentRegexp = searchState.regexp,
                            element = currentEditor
                              .findElemById(htmlNode.cid)[0]
                              .querySelector('.md-htmlblock-container'),
                            text = element.textContent;
                          currentRegexp.lastIndex = 0;
                          for (var regexpMatch = null; (regexpMatch = currentRegexp.exec(text)); ) {
                            if (
                              (matchRecord = {
                                cid: htmlNode.cid,
                                containerNode: element,
                                start: currentRegexp.lastIndex - regexpMatch[0].length,
                                end: currentRegexp.lastIndex,
                              }).start == matchRecord.end
                            ) {
                              return;
                            }
                            (range = range || rangy.createRange()).moveToBookmark(matchRecord);
                            if (3 == range.commonAncestorContainer.nodeType) {
                              var highlightElement = markSearchRange(range);
                              searchState.hits.push(highlightElement);
                              if (isHitBeforeInitialPosition(matchRecord)) {
                                searchState.curPos++;
                              }
                              if (searchState.hits.length > MAX_HITS_COUNT) {
                                return;
                              }
                            }
                          }
                        })(documentNode);
                      }
                    } else {
                      searchRenderedNode(documentNode);
                    }
                  }
                }
              }
            }
          },
          'name',
          { value: 'e', configurable: true },
        )(rootNode, queryText);
      }
    }
    highlightNext(backward) {
      Object.defineProperty(compareRangeWithHit, 'name', { value: 'o', configurable: true });
      Object.defineProperty(compareBookmarkWithHit, 'name', { value: 'a', configurable: true });

      if (!this.isOpen()) {
        return this.showPanel(void 0, true);
      }
      $('#md-searchpanel').removeClass('searchpanel-msg-mode');
      var isCm,
        searchStatus = this.searchStatus,
        currentEditor = this.editor;
      if (!(searchStatus && searchStatus.hits.length)) {
        this.doSearch();
      }
      if (searchStatus && searchStatus.hits.length) {
        var comparisonRange = null;
        if (searchStatus.curSelection) {
          searchStatus.curPos += backward ? -1 : 1;
        } else {
          (function () {
            if (currentEditor.lastCursor) {
              if (void 0 != currentEditor.lastCursor.startId) {
                var range = currentEditor.selection.rangy.createRange();
                range.moveToBookmark({
                  containerNode: currentEditor.findElemById(currentEditor.lastCursor.startId)[0],
                  start: currentEditor.lastCursor.start,
                  end: currentEditor.lastCursor.start,
                });
                searchStatus.curPos = 0;
                for (var itemIndex = 0; itemIndex < searchStatus.hits.length; itemIndex++) {
                  if (!(compareRangeWithHit(range, (hit = searchStatus.hits[itemIndex])) > 0)) {
                    return;
                  }
                  searchStatus.curPos++;
                }
              } else {
                if (currentEditor.lastCursor.pos) {
                  for (
                    searchStatus.curPos = 0, itemIndex = 0;
                    itemIndex < searchStatus.hits.length;
                    itemIndex++
                  ) {
                    var hit = searchStatus.hits[itemIndex];
                    if (!(compareBookmarkWithHit(currentEditor.lastCursor, hit) > 0)) {
                      return;
                    }
                    searchStatus.curPos++;
                  }
                }
              }
            }
          })();
        }
        if (searchStatus.curPos >= searchStatus.hits.length) {
          searchStatus.curPos = 0;
        } else {
          if (searchStatus.curPos < 0) {
            searchStatus.curPos = searchStatus.hits.length - 1;
          } else {
            if (isNaN(searchStatus.curPos - 0)) {
              searchStatus.curPos = 0;
            }
          }
        }
        (function (unusedParameter1) {
          (function () {
            if (searchStatus.curSelection) {
              if ((isCm = searchStatus.curSelection.isCm)) {
                isCm.execCommand(backward ? 'goDocStart' : 'goDocEnd');
              } else {
                searchStatus.curSelection.classList.remove('md-search-select');
              }
            }
          }).call(this);
          searchStatus.curSelection = searchStatus.hits[searchStatus.curPos];
          searchStatus.initPos = null;
          $('.md-focus').removeClass('md-focus');
          if (searchStatus.curSelection.isFutureCm) {
            searchStatus.curSelection.isCm = currentEditor.fences.addCodeBlock(
              searchStatus.curSelection.isFutureCm,
            );
            searchStatus.curSelection.isFutureCm = false;
          }
          if ((isCm = searchStatus.curSelection.isCm)) {
            searchStatus.lastRange = null;
            isCm.doc.setSelection(
              isCm.posFromIndex(searchStatus.curSelection.start),
              isCm.posFromIndex(searchStatus.curSelection.end),
            );
            var element = isCm.getScrollerElement();
            if (!element) {
              return;
            }
            var currentElement = element.querySelector('.CodeMirror-selectedtext');
            if (!currentElement) {
              return;
            }
            if (File.isTypeWriterMode) {
              currentEditor.selection.typeWriterScroll(currentElement);
            } else {
              currentEditor.selection.scrollAdjust(currentElement, void 0, 200);
            }
            $(element).closest('[cid]').addClass('md-focus');
          } else {
            searchStatus.curSelection.classList.add('md-search-select');
            searchStatus.lastRange = searchStatus.curSelection;
            if (File.isTypeWriterMode) {
              currentEditor.selection.typeWriterScroll($(searchStatus.curSelection));
            } else {
              currentEditor.selection.scrollAdjust($(searchStatus.curSelection), void 0, 200);
            }
            $(searchStatus.curSelection).closest('[cid]').addClass('md-focus');
          }
        }).call(this, searchStatus.curPos);
        this.updateIndexUI();
      } else {
        this.updateIndexUI();
      }
      function compareRangeWithHit(selectionRange, hit) {
        try {
          var range = currentEditor.selection.rangy.createRange();
          if (hit.isCm) {
            range.selectNode(hit.isCm.getWrapperElement());
          } else {
            if (hit.isFutureCm) {
              range.selectNode(currentEditor.findElemById(hit.isFutureCm)[0]);
            } else {
              range.selectNode(hit);
            }
          }
          return selectionRange.compareBoundaryPoints(Range.END_TO_END, range);
        } catch (error) {
          console.sendError(error, 'warning');
        }
      }
      function compareBookmarkWithHit(cursorBookmark, hit) {
        try {
          if (hit.isCm && hit.isCm.cid == cursorBookmark.id) {
            return hit.isCm.indexFromPos(cursorBookmark.pos) - hit.end;
          }
          if (!comparisonRange) {
            (comparisonRange = currentEditor.selection.rangy.createRange()).selectNode(
              currentEditor.findElemById(cursorBookmark.id)[0],
            );
          }
          var range = currentEditor.selection.rangy.createRange();
          if (hit.isCm) {
            range.selectNode(hit.isCm.getWrapperElement());
          } else {
            if (hit.isFutureCm) {
              range.selectNode(currentEditor.findElemById(hit.isFutureCm)[0]);
            } else {
              range.selectNode(hit);
            }
          }
          return comparisonRange.compareBoundaryPoints(Range.END_TO_END, range);
        } catch (error) {
          console.sendError(error, 'warning');
        }
      }
    }
    clearSearch(unusedParameter1, keepExpanded, preserveState) {
      var initialPosition = restoreInitialSearchPosition(this.searchStatus);
      if (this.editor.sourceView.inSourceMode) {
        this.editor.fences.clearSearchAll();
        return void (
          preserveState ||
          (this.resetSearchStatus(initialPosition),
          clearTimeout(this.searchTimer),
          (this.searchTimer = null))
        );
      }
      if (!keepExpanded) {
        $('.md-search-expand').removeClass('md-search-expand');
      }
      var currentDomNode,
        items = [];
      if (this.searchStatus) {
        for (var itemIndex = 0; itemIndex < this.searchStatus.hits.length; itemIndex++) {
          var domNode = this.searchStatus.hits[itemIndex];
          if (domNode.parentElement) {
            if (!domNode.isCm) {
              if (domNode.parentElement.classList.contains('md-inline-math-container')) {
                items.push(domNode.closest('.md-inline-math'));
              } else {
                currentDomNode = domNode;
                dialogs.unmarkSpan(currentDomNode);
              }
            }
          }
        }
        var curSelection = this.searchStatus.curSelection,
          isCm = (curSelection || {}).isCm;
        if (isCm) {
          isCm.doc.setSelection(isCm.posFromIndex(curSelection.start));
          $(isCm.display.input.textarea).blur();
        }
      }
      items.forEach((element) => {
        element.outerHTML = inlineDecoration.decorate({
          type: NodeType.inline_math,
          text: $(element.querySelector('.md-inline-math-container')).rawText(),
          pattern: element.querySelector('.md-before').textContent,
        });
      });
      this.editor.fences.clearSearchAll();
      if (!preserveState) {
        this.resetSearchStatus(initialPosition);
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
    }
    emptySearchStatus(initPos) {
      return {
        hits: [],
        curPos: 0,
        searchText: null,
        lastRange: null,
        initPos: initPos,
        curSelection: null,
      };
    }
    resetSearchStatus(initialPosition) {
      this.searchStatus = this.emptySearchStatus(initialPosition);
      this.updateIndexUI();
    }
  };
}
