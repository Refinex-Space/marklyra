// editor-controller.
export default function initializeEditorController($__require, exports, module) {
  'use strict';
  var global = this || self,
    GLOBAL = global,
    _polyfill = $__require('host/environment'),
    $ = $__require('libraries/jquery'),
    StringUtils = $__require('shared/utilities'),
    NodeDef = $__require('model/document-model'),
    Node = NodeDef.Node,
    TYPE = NodeDef.TYPE,
    MarkParser = $__require('model/markdown-parser'),
    Node2Mark = $__require('model/markdown-serializer'),
    Node2HTML = $__require('model/html-renderer'),
    NodeOperation = $__require('model/node-editing'),
    Fences = $__require('render/code-fences'),
    MathBlock = $__require('render/math-blocks'),
    MathInline = $__require('render/inline-math'),
    Brush = $__require('render/brush-queue'),
    AutoComplete = $__require('editing/autocomplete'),
    Selection = $__require('editing/selection'),
    rangy = Selection.rangy,
    EditHelper = $__require('ui/dialogs'),
    HTMLBlock = $__require('render/html-blocks'),
    TableEdit = $__require('editing/table-editor'),
    ImageEdit = $__require('media/image-editor'),
    UndoManager = $__require('editing/undo-manager'),
    SnapFlag = UndoManager.SnapFlag,
    KeyMaster = $__require('editing/keyboard-shortcuts'),
    keyNames = KeyMaster.map,
    UserOp = $__require('editing/user-operations'),
    MediaOp = $__require('media/actions'),
    FileInfoPanel = $__require('document/recovery'),
    File = $__require('document/file-controller'),
    FileAction = $__require('document/editing-state'),
    DocMenu = $__require('ui/outline'),
    Stylize = $__require('editing/formatting'),
    SearchPanel = $__require('ui/find-replace'),
    Emoji = $__require('editing/emoji'),
    WordCount = $__require('ui/word-count'),
    Word = $__require('ui/page-breaks'),
    Export = $__require('export/controller'),
    SourceView = $__require('editing/source-mode'),
    FileHelper = $__require('host/file-integration'),
    LocalSettingBridge = $__require('document/project-settings'),
    QuickOpenPanel = $__require('ui/folder-search'),
    ContextMenu = $__require('ui/context-menu'),
    SpellCheck = $__require('ui/spelling'),
    Library = $__require('ui/sidebar'),
    DBCLICK_DELAY = 180,
    clicks = 0,
    clickTimer = null,
    busyLoadTimer,
    $curLinkElem,
    isInputComponent = function (domNode) {
      return (
        !!domNode &&
        ('TEXTAREA' == domNode.tagName ||
          'INPUT' == domNode.tagName ||
          'SELECT' == domNode.tagName ||
          (domNode.classList && domNode.classList.contains('marklyra-input')))
      );
    };
  window.isInputComponent = isInputComponent;
  class Editor {
    constructor(sessionStr, fileController) {
      this.sessionStr = sessionStr;
      this.EditHelper = EditHelper;
      this.MarkParser = MarkParser;
      this.writingArea = document.querySelector(this.sessionStr);
      fileController.setEditor(this);
      fileController.readOption();
      fileController._onInitTheme = true;
      fileController.setTheme();
      setTimeout(function () {
        fileController._onInitTheme = false;
      }, 300);
      this.nodeMap = new NodeDef.NodeMap();
      this.imgEdit = new ImageEdit(this);
      this.docMenu = new DocMenu(this);
      this.undo = new UndoManager(this);
      this.localSettingBridge = new LocalSettingBridge(this);
      fileController.exitOversize();
      this.registerBridge();
      fileController.setup();
      fileController.loadFile(fileController.option.initFilePath);
      this.library = new Library(this);
      this.library.init();
      this._pasteboard = {};
      this.timerPool_ = {};
      this._bindGlobal();
      this._bindKeyEvents();
      this._bindMouseEvents();
      this.focusCid = null;
      this.selection = new Selection(this);
      this.keypressMsg = '';
      this.mathInline = new MathInline(this);
      this.wordCount = new WordCount(this);
      this.brush = new Brush(this);
      this.tableEdit = new TableEdit(this);
      this.fences = new Fences(this);
      this.mathBlock = new MathBlock(this);
      this.htmlBlock = new HTMLBlock(this);
      this.stylize = new Stylize(this);
      this.brush.run();
      this.UserOp = UserOp;
      this.searchPanel = new SearchPanel(this);
      this.writingArea.focus();
      this.sourceView = new SourceView(this);
      this.emoji = new Emoji(this);
      this.word = new Word(this);
      this.export = new Export(this);
      if (fileController.isMac || fileController.isNode) {
        setTimeout(fileController.bindMenu, 200);
      }
      fileController.freshLock();
      this.quickOpenPanel = new QuickOpenPanel(this);
      this.quickOpenPanel.init();
      this.spellChecker = new SpellCheck(this);
      this.contextMenu = new ContextMenu(this.sessionStr);
      this.dropTargetDom = null;
      this.strollingBySelect = false;
      this.updateFocusMode(fileController.isFocusMode, true, true);
      this.setTypeWriterMode(fileController.isTypeWriterMode, true, true);
      setTimeout(function () {
        fileController.option.silentOpenFailure = false;
      }, 2e3);
      this.autoComplete = new AutoComplete(this);
      this.useIMEKeyboard = false;
      this.busyModeSource;
    }
    registerBridge() {
      if (File.isMac) {
        var receiver = this;
        bridge.registerHandler('editor.applyChange', function (changePayload, respond) {
          receiver.applyChange(changePayload);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('editor.applyFullContent', function (contentPayload, respond) {
          receiver.applyFullContent(contentPayload[0], contentPayload[1]).then(() => {
            if (respond) {
              respond();
            }
          });
        });
        bridge.registerHandler('editor.insertText', function (insertedText, respond) {
          receiver.insertText(insertedText);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('editor.setPasteboard', function (pasteboardEntry, respond) {
          receiver.setPasteboard(pasteboardEntry[0], pasteboardEntry[1]);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('editor.resetPasteboard', function (unusedParameter1, respond) {
          receiver.resetPasteboard();
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler(
          'window.showNotificationWithTitle',
          function (notificationArgs, respond) {
            EditHelper.showNotificationWithTitle(notificationArgs[0], notificationArgs[1]);
            if (respond) {
              respond();
            }
          },
        );
        bridge.registerHandler('editor.showZoomPanel', function (zoomOptions, respond) {
          EditHelper.showZoomPanel(zoomOptions);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('editor.getSpeechText', function (unusedParameter1, respond) {
          respond(UserOp.getSpeechText());
        });
        bridge.registerHandler('editor.jumpToAnchor', function (initAnchor, respond) {
          if ('#' == (initAnchor || '')[0] && initAnchor.trim().length > 1) {
            if (File._onInitParse) {
              File.option.initAnchor = initAnchor;
            } else {
              if (File._scrollTopTimer) {
                clearTimeout(File._scrollTopTimer);
              }
              File._scrollTopTimer = setTimeout(() => {
                receiver.tryOpenUrl(initAnchor);
              }, 0);
            }
          }
          if (respond) {
            respond();
          }
        });
      }
    }
    beforeSpellChecking() {
      if (!File.isLocked) {
        setAttributeOnlyNeeded(this.writingArea, 'contenteditable', 'true');
      }
      var element = this.writingArea.children[0];
      if (element && 'false' == element.getAttribute('contenteditable')) {
        element.setAttribute('contenteditable', 'true');
        this.afterSpellChecking = function () {
          element.setAttribute('contenteditable', 'false');
        };
      } else {
        this.afterSpellChecking = function () {};
      }
    }
    freeLayout() {
      if (!File.isLocked) {
        setAttributeOnlyNeeded(this.writingArea, 'contenteditable', 'true');
      }
    }
    tryEnterBusyModeWithDelay(delayMs) {
      if (busyLoadTimer) {
        clearTimeout(busyLoadTimer);
      }
      busyLoadTimer = setTimeout(() => {
        this.tryEnterBusyMode();
      }, delayMs || 100);
    }
    tryEnterBusyMode(contentText, preserveEditable, forceBusyMode) {
      Object.defineProperty(enterBusyMode, 'name', { value: 'o', configurable: true });
      Object.defineProperty(leaveBusyMode, 'name', { value: 'a', configurable: true });

      var currentWritingArea = this.writingArea,
        receiver = this;
      function enterBusyMode() {
        if (!File.inBusyMode) {
          console.sendLog('enter busy mode');
        }
        File.inBusyMode = true;
        File.editor.brush.interval = 500;
        if (!preserveEditable) {
          setAttributeOnlyNeeded(currentWritingArea, 'contenteditable', 'false');
        }
      }
      function leaveBusyMode(busyModeSource) {
        if (
          !(busyModeSource && receiver.busyModeSource && receiver.busyModeSource !== busyModeSource)
        ) {
          receiver.busyModeSource = null;
          if (File.inBusyMode) {
            console.sendLog('leave busy mode');
          }
          File.inBusyMode = false;
          File.editor.brush.interval = 200;
          if (!File.isLocked) {
            if (!preserveEditable) {
              setAttributeOnlyNeeded(currentWritingArea, 'contenteditable', 'true');
            }
          }
        }
      }
      if (void 0 !== forceBusyMode) {
        return void (forceBusyMode ? enterBusyMode() : leaveBusyMode());
      }
      const useLowerThreshold = this.useIMEKeyboard || File.isMac;
      if (void 0 !== contentText && null !== contentText) {
        if (File.inBusyMode) {
          return;
        }
        if (contentText.length > 1e3 * (useLowerThreshold ? 35 : 60)) {
          enterBusyMode();
          this.busyModeSource = 'content';
        } else {
          leaveBusyMode('content');
        }
      } else {
        var htmlLength = currentWritingArea.innerHTML.length,
          exceedsBusyThreshold =
            this.nodeMap.allNodes.length > 1e4 ||
            htmlLength > 1e3 * (useLowerThreshold ? 1500 : 3e3);
        if (!exceedsBusyThreshold) {
          htmlLength +=
            1e3 * currentWritingArea.querySelectorAll('img, svg, .CodeMirror').length * 5;
          if (File.option.showLineNumbersForFence) {
            htmlLength += 1e3 * currentWritingArea.querySelectorAll('.CodeMirror').length * 2;
          }
          exceedsBusyThreshold = htmlLength > 1e3 * (useLowerThreshold ? 1200 : 2400);
        }
        if (exceedsBusyThreshold) {
          enterBusyMode();
          this.busyModeSource = 'html';
        } else {
          leaveBusyMode('html');
        }
      }
    }
    runAllScript() {
      if (this.scriptTimer) {
        clearTimeout(this.scriptTimer);
        this.scriptTimer = null;
      }
      var writingArea = this.writingArea;
      this.scriptTimer = setTimeout(function () {
        writingArea.querySelectorAll('script[data-run]').forEach(function (d) {
          d.removeAttribute('data-run');
          eval(d.textContent);
        });
      }, 100);
    }
    reset(text) {
      window.Reporter.record('editor.reset');
      File._onInitParse = true;
      if (File.bundle.unsupported) {
        text = '';
      }
      let html = new NodeDef.Node({
        type: NodeDef.TYPE.raw_edit,
        in: this.nodeMap,
        attachTo: this.nodeMap,
        text: text,
      }).parseFrom({ skips: { old_code: false } })[0];
      this.writingArea.innerHTML = '';
      if (File.isMac && html.length > 1e5) {
        console.debug('hotfix for macOS slowness');
        setTimeout(() => {
          this.writingArea.innerHTML = html;
          this.tryEnterBusyMode(text);
          document.querySelectorAll('[guest-id]').forEach(window.loadedWebview);
          window.Reporter.fullValidate();
        }, 0);
      } else {
        this.writingArea.innerHTML = html;
        this.tryEnterBusyMode(text);
        document.querySelectorAll('[guest-id]').forEach(window.loadedWebview);
        window.Reporter.fullValidate();
      }
      this.focusCid = null;
      this.lastCursor = null;
      File._needsUpdateSnap = new Date();
      File._onInitParse = false;
      var receiver = this;
      setTimeout(function () {
        receiver.refresh(void 0, void 0, true);
        if (receiver.wordCount) {
          receiver.wordCount.update(text);
        }
      }, 80);
      if (this.spellChecker) {
        this.spellChecker.reset();
      }
      if (this.fences) {
        this.fences.onLeaveDocument();
      }
      if (this.mathInline) {
        this.mathInline.onLeaveDocument();
      }
    }
    quickRefresh() {
      this.refresh(false, true);
    }
    refreshUnder(element, themeOnly, forceMathRefresh) {
      let mathRefreshPromise;
      if (!themeOnly) {
        mathRefreshPromise =
          forceMathRefresh && !File.inBusyMode
            ? this.mathBlock.forceRefresh()
            : this.mathBlock.renderUnder(element, forceMathRefresh);
        if (this.docMenu) {
          this.docMenu.refreshFootnoteReverseLink(element);
        }
      }
      if (this.fences.modeLoaded) {
        this.fences.refreshEditor(false, themeOnly, element);
      }
      if (this.diagrams.modeLoaded) {
        if (themeOnly) {
          File.editor.diagrams.loadMermaidTheme();
        }
        this.diagrams.refreshDiagram(themeOnly, element);
      }
      if (!themeOnly && this.htmlBlock) {
        this.htmlBlock.refreshUnder(element);
      }
      if (element) {
        this.wordCount.quickUpdate(element.getAttribute('cid'), true);
      }
      return mathRefreshPromise;
    }
    refresh(themeOnly, skipOutlineRefresh, forceMathRefresh) {
      if (File._onInitParse) {
        return;
      }
      var isActiveWindow = File.isActiveWindow();
      if (this.sourceView && this.sourceView.inSourceMode) {
        return void (themeOnly && this.sourceView.cm.refresh());
      }
      if (!this.brush) {
        return void (this._brushInitCallback = function () {
          this.refresh(themeOnly, skipOutlineRefresh);
        }.bind(this));
      }
      if (!$(this.writingArea).find('.md-mathblock-panel').length) {
        if (this.mathBlock) {
          this.mathBlock.currentCm = void 0;
        }
      }
      if (!(skipOutlineRefresh || themeOnly)) {
        this.nodeMap.toc.refresh(true);
      }
      let mathRefreshPromise = this.refreshUnder(void 0, themeOnly, forceMathRefresh);
      if (isActiveWindow) {
        if (!themeOnly) {
          this.wordCount.quickUpdate(this.focusCid, true);
          if (this.brush && this.stylize) {
            if (!isInputComponent(document.activeElement)) {
              this.brush.expand(void 0, true);
            }
            if (File.isNode) {
              File.refreshImageCopyStatus(true);
            }
          }
          this.runAllScript();
          $('#marklyra-table-row-tracker, #marklyra-table-col-tracker').hide();
          this.tryEnterBusyModeWithDelay(500);
          if (mathRefreshPromise) {
            mathRefreshPromise.then(() => {
              this.tryEnterBusyModeWithDelay();
            });
          }
        }
      }
    }
    getJQueryElem(domNode) {
      if (domNode) {
        if (domNode.nodeType == domNode.ELEMENT_NODE) {
          return $(domNode);
        } else {
          return $(domNode.parentNode);
        }
      } else {
        return $();
      }
    }
    getMarkElem(domNode) {
      if (
        !domNode &&
        document.activeElement.nodeType == window.Node.ELEMENT_NODE &&
        (('write' !== document.activeElement.id &&
          document.activeElement.hasAttribute('tabindex')) ||
          Node.isType(document.activeElement.tagName, 'TEXTAREA', 'INPUT'))
      ) {
        return $(document.activeElement).closest('[cid]');
      }
      if (!(domNode = domNode || window.getSelection().focusNode || document.activeElement)) {
        return [];
      }
      var element = domNode.nodeType == domNode.ELEMENT_NODE ? $(domNode) : $(domNode.parentNode);
      if (!(!element.length || ('TH' !== element[0].tagName && 'TD' !== element[0].tagName))) {
        element = element.children('.td-span');
      }
      if (StringUtils.isNullOrEmpty(element.attr('cid'))) {
        element = element.closest('[cid]');
      }
      return element;
    }
    autoRemoveUnholdable(preservePlaceholder) {
      var element = this.focusCid && this.findElemById(this.focusCid).closest('.unholdable');
      if (element && element.length) {
        try {
          this.undo.endSnap(true);
          if (element.next().length || element.text().length) {
            element.removeClass('unholdable');
          } else {
            var placeholderNode = this.findNodeByElem(element),
              removeCommand =
                removeCommand || UndoManager.makeEmptyCommand(this.selection.buildUndo()),
              range = this.selection.getRangy();
            if (
              element[0] &&
              (range.commonAncestorContainer === element[0] ||
                element[0].contains(range.commonAncestorContainer))
            ) {
              return;
            }
            this.undo.UndoManager.addUndoForRemove(removeCommand, placeholderNode);
            removeCommand.redo.push(this.selection.buildUndo(range));
            var firstSibling = placeholderNode.getVeryFirstBrother(true, true);
            if (!firstSibling) {
              return;
            }
            if (!preservePlaceholder) {
              placeholderNode.remove();
              element.remove();
              this.selection.jumpIntoElemEnd(this.findElemById(firstSibling.cid));
              removeCommand.redo.push(this.selection.buildUndo());
              this.undo.register(removeCommand);
              this.refocus(firstSibling.cid, false, true);
            }
          }
        } catch (error) {
          console.warn(error.stack);
        }
      } else {
        $('#write .unholdable')
          .filter(function () {
            return this.textContent.length;
          })
          .removeClass('unholdable');
      }
    }
    store(nodeOrId, storeChildren) {
      if (
        (!this.sourceView || !this.sourceView.inSourceMode) &&
        (nodeOrId = nodeOrId || this.focusCid)
      ) {
        var documentNode = nodeOrId.id ? nodeOrId : this.nodeMap.allNodes.get(nodeOrId);
        if (documentNode) {
          var nodeElement = this.findElemById(documentNode.id);
          if (nodeElement.length > 0) {
            var text = nodeElement.rawText(true);
            if (!Node.isType(documentNode, TYPE.hr, TYPE.toc)) {
              if (Node.isType(documentNode, TYPE.meta_block)) {
                text = text.replace(/\n$/, '');
                documentNode.set('text', text);
              } else {
                if (Node.isType(documentNode, TYPE.math_block)) {
                  if (nodeElement.find('.CodeMirror-code').length) {
                    this.mathBlock.syncToNode(documentNode);
                  }
                } else {
                  if (Node.isType(documentNode, TYPE.fences)) {
                    if (nodeElement.find('.CodeMirror-code').length) {
                      this.fences.syncToNode(documentNode);
                    }
                  } else {
                    if (Node.isType(documentNode, TYPE.html_block)) {
                      if (nodeElement.find('.CodeMirror-code').length) {
                        this.htmlBlock.syncToNode(documentNode);
                      }
                    } else {
                      if (Node.isType(documentNode, TYPE.def_footnote, TYPE.def_link)) {
                        Node.reverseAttrFromElem(documentNode, nodeElement.clone(), void 0, true);
                      } else {
                        if (
                          Node.isType(
                            documentNode,
                            TYPE.heading,
                            TYPE.raw_edit,
                            TYPE.paragraph,
                            TYPE.table_cell,
                          ) &&
                          !nodeElement[0].querySelector('[cid]')
                        ) {
                          if (Node.isType(documentNode, TYPE.paragraph)) {
                            documentNode.set('text', text.replace(/^( {4}|\t)/, '​$1'));
                          } else {
                            documentNode.set('text', text);
                          }
                        } else {
                          if (storeChildren) {
                            documentNode.get('children').map(function (item) {
                              if (nodeElement[0].querySelector("[cid='" + item.cid + "']")) {
                                this.store(item);
                              } else {
                                item.remove();
                              }
                            }, this);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            if (documentNode) {
              this.wordCount.quickUpdate(documentNode, false, true);
            }
            if (Node.isType(documentNode, Node.TYPE.meta_block) && !storeChildren) {
              this.imgEdit.updateLocalRootUrl();
            }
            return documentNode;
          }
          this.focusCid = null;
        }
      }
    }
    cleanTooltip() {
      $('content').find('.auto-suggest-container.marklyra-show').removeClass('marklyra-show');
      normalCleanTooltip_();
      this.mathBlock.stopEditing();
    }
    refocus(focusCid, storeTarget, skipExpansion, enableStartMatch, skipParsing) {
      if (clickTimer) {
        clearTimeout(clickTimer);
      }
      if (this.isIME) {
        return focusCid;
      }
      if (!this.sourceView || !this.sourceView.inSourceMode) {
        var parseResult,
          element = focusCid ? this.findElemById(focusCid) : this.getMarkElem(),
          receiver = this,
          currentFocusCid = this.nodeMap.allNodes.get(this.focusCid),
          nodeElement = receiver.findElemById(this.focusCid);
        if (receiver.library) {
          receiver.library.outline.autoHideOutline();
        }
        if (focusCid && element.find('[cid]').length) {
          focusCid = (element = this.getMarkElem()).attr('cid');
        }
        focusCid = void 0 === focusCid ? element.attr('cid') : focusCid;
        if (storeTarget && focusCid) {
          receiver.store(focusCid);
        }
        if (this.focusCid != focusCid || !element.hasClass('md-focus')) {
          if (this.focusCid != focusCid) {
            (function () {
              var currentNodeElement = receiver.findElemById(receiver.focusCid);
              if (skipParsing) {
                currentNodeElement.trigger('endfocus');
              } else {
                currentNodeElement.trigger('blur').trigger('losefocus');
              }
              currentNodeElement.find('.md-tooltip-hide').hide();
              normalCleanTooltip_();
              if (Node.isType(currentFocusCid, Node.TYPE.paragraph)) {
                currentFocusCid.unset('depth');
              }
              receiver.undo.endSnap();
            })();
          }
          if (this.focusCid == focusCid) {
            if (!element.hasClass('md-focus')) {
              element.addClass('md-focus').trigger('refocus');
            }
            return focusCid;
          }
          var incompleteCommand;
          if (
            (incompleteCommand = this.undo.lastRegisteredOperationCommand()) &&
            !incompleteCommand.incomplete
          ) {
            incompleteCommand = null;
          }
          this.store(this.focusCid);
          if (
            this.lastCursor &&
            this.lastCursor.startId === this.lastCursor.endId &&
            this.lastCursor.startId
          ) {
            this.lastCursor.id = this.lastCursor.startId;
          }
          if (incompleteCommand && this.lastCursor && this.focusCid == this.lastCursor.id) {
            incompleteCommand.redo.push(this.lastCursor);
            receiver.undo.endSnap(true);
            incompleteCommand = null;
          }
          if (element.hasClass('.md-meta-block')) {
            element[0].normalize();
          }
          element.addClass('md-focus').trigger('refocus');
          $(document.activeElement).trigger('focus');
          if (
            File.option.expandSimpleBlock &&
            (this.focusCid = UserOp.simpleExpand(this, focusCid))
          ) {
            if ('block' == document.querySelector('#md-searchpanel').style.display) {
              this.searchPanel.closePanel();
            }
            focusCid = this.focusCid;
          } else {
            if (!(skipExpansion || skipParsing)) {
              this.brush.expandOnDelay(false);
            }
            this.wordCount.quickUpdate(focusCid);
            this.focusCid = focusCid;
          }
          if (File.isLocked) {
            return this.focusCid;
          }
          if (
            ((this.focusCid &&
              currentFocusCid &&
              !(
                $.contains(nodeElement, element) ||
                $.contains(element, nodeElement) ||
                (element.length && element.is(nodeElement))
              )) ||
              (currentFocusCid && !this.focusCid)) &&
            (parseResult = !skipParsing && this.simpleParse(currentFocusCid, enableStartMatch))
          ) {
            parseResult[0].undo[0] = receiver.lastCursor;
            setTimeout(function () {
              parseResult[0].redo.push(receiver.selection.buildUndo());
              receiver.findElemById(parseResult[2]).replaceWith(parseResult[1]);
              if (incompleteCommand) {
                UndoManager.append(incompleteCommand, parseResult[0]);
                parseResult[0] = incompleteCommand;
              } else {
                receiver.undo.register(parseResult[0], true);
              }
              receiver.quickRefresh();
              receiver.selection.scrollAdjust();
              receiver.undo.exeCommand(parseResult[0].redo.last());
            }, 50);
          }
          receiver.undo.endSnap(true);
          this.library.outline.highlightVisibleHeader();
          if (this.focusCid) {
            this.brush.focusContainer(element);
          }
        }
        receiver.isIME = 0;
        if (!(skipExpansion || skipParsing)) {
          this.brush.expandOnDelay();
        }
        return focusCid;
      }
    }
    focusAndRestorePos() {
      if (
        document.activeElement != this.writingArea &&
        !this.writingArea.contains(document.activeElement)
      ) {
        var scrollContainer = $('content'),
          scrollTop = scrollContainer.scrollTop();
        this.writingArea.focus();
        scrollContainer.scrollTop(scrollTop);
      }
    }
    resetPasteboard() {
      this._pasteboard = {};
    }
    setPasteboard(format, content) {
      this._pasteboard = this._pasteboard || {};
      this._pasteboard[format] = content;
    }
    _bindGlobal() {
      Object.defineProperty(refreshTableAndTypewriterLayout, 'name', {
        value: 'n',
        configurable: true,
      });

      var timerId,
        receiver = this;
      function refreshTableAndTypewriterLayout() {
        if ($('.marklyra-table-edit').length) {
          receiver.tableEdit.resizeTableEdit($('.marklyra-table-edit').next());
        }
        $('.marklyra-table-tracker').hide();
        receiver.setTypeWriterMode(File.isTypeWriterMode, true);
        timerId = null;
      }
      if (File.option.moveColLeftKey) {
        KeyMaster(File.option.moveColLeftKey, function (event) {
          if (File.editor.tableEdit.moveColLeftOrRight(true)) {
            event.preventDefault();
            event.stopPropagation();
          }
        });
      }
      if (File.option.moveColRightKey) {
        KeyMaster(File.option.moveColRightKey, function (event) {
          if (File.editor.tableEdit.moveColLeftOrRight(false)) {
            event.preventDefault();
            event.stopPropagation();
          }
        });
      }
      if (File.option.moveRowUpKey) {
        KeyMaster(File.option.moveRowUpKey, function (event) {
          File.editor.UserOp.moveRowUpOrDown(true);
          event.preventDefault();
          event.stopPropagation();
        });
      }
      if (File.option.moveRowDownKey) {
        KeyMaster(File.option.moveRowDownKey, function (event) {
          File.editor.UserOp.moveRowUpOrDown(false);
          event.preventDefault();
          event.stopPropagation();
        });
        if (File.isMac) {
          KeyMaster(File.option.jumpToLineStartKey, function (event) {
            event.preventDefault();
            File.editor.selection.jumpToLineStart();
          });
          KeyMaster(File.option.jumpToLineEndKey, function (event) {
            event.preventDefault();
            File.editor.selection.jumpToLineEnd();
          });
        }
      }
      if (File.isNodeHtml) {
        KeyMaster('ctrl+home', function (unusedParameter1) {
          File.editor.selection.jumpTop();
        });
        KeyMaster('ctrl+end', function (unusedParameter1) {
          File.editor.selection.jumpBottom();
        });
        KeyMaster('end', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(true, null, false, true);
          }, 0);
        });
        KeyMaster('home', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(false, null, false, true);
          }, 0);
        });
        KeyMaster('shift+end', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(true, null, false, false);
          }, 0);
        });
        KeyMaster('shift+home', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(false, null, false, false);
          }, 0);
        });
        KeyMaster('ctrl+z, command+z', function (keyboardEvent) {
          ClientCommand.undo(keyboardEvent);
          return false;
        });
        KeyMaster('ctrl+y, command+y, command+shift+z, ctrl+shift+z', function (keyboardEvent) {
          ClientCommand.redo(keyboardEvent);
          return false;
        });
      } else {
        KeyMaster('ctrl+k', function (event) {
          var selectionRange = receiver.selection.getRangy();
          if (selectionRange && !isInputComponent(document.activeElement)) {
            if (selectionRange.collapsed) {
              var currentElement = receiver.getMarkElem();
              selectionRange.setEnd(currentElement[0], currentElement[0].childNodes.length);
              receiver.selection.setRange(selectionRange, true);
            }
            if (selectionRange.toString().length) {
              UserOp.backspaceHandler(receiver, event, 'delSelection');
            } else {
              UserOp.backspaceHandler(receiver, event, true);
            }
            event.preventDefault();
            event.stopPropagation();
          }
        });
        KeyMaster('command+right', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(true, null, false, true);
          }, 0);
        });
        KeyMaster('command+left', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(false, null, false, true);
          }, 0);
        });
        KeyMaster('command+shift+right', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(true, null, false, false);
          }, 0);
        });
        KeyMaster('command+shift+left', function (unusedParameter1) {
          setTimeout(function () {
            File.editor.selection.fixExtendToLineEdge(false, null, false, true);
          }, 0);
        });
        KeyMaster('command+up, command+down', function (unusedParameter1) {
          setTimeout(function () {
            receiver.refocus();
          }, 0);
        });
        KeyMaster('ctrl+h', function (keyboardEvent) {
          if (receiver.selection.getRangy() && !isInputComponent(document.activeElement)) {
            UserOp.backspaceHandler(receiver, keyboardEvent, 'Backspace');
          }
        });
        KeyMaster('ctrl+d', function (keyboardEvent) {
          if (receiver.selection.getRangy() && !isInputComponent(document.activeElement)) {
            UserOp.backspaceHandler(receiver, keyboardEvent, 'Delete');
          }
        });
        KeyMaster('ctrl+tab', function (unusedParameter1) {
          if (File.isMac) {
            bridge.callHandler('window.selectNextTab');
          }
        });
        KeyMaster('ctrl+shift+tab', function (unusedParameter1) {
          if (File.isMac) {
            bridge.callHandler('window.selectPreviousTab');
          }
        });
        KeyMaster('command+y', function (keyboardEvent) {
          if (File.isLocked) {
            return false;
          }
          File.editor.undo.redo(keyboardEvent);
          File.freshMenu();
        });
      }
      if (!(File.isMac || File.isNode)) {
        if (!File.isNodeHtml) {
          KeyMaster('command+z, ctrl+z', function (keyboardEvent) {
            if (File.isLocked) {
              return false;
            }
            if (receiver.writingArea.contains(keyboardEvent.target)) {
              receiver.undo.undo(keyboardEvent);
            }
          });
          KeyMaster('ctrl+y', function (keyboardEvent) {
            if (File.isLocked) {
              return false;
            }
            if (receiver.writingArea.contains(keyboardEvent.target)) {
              receiver.undo.redo(keyboardEvent);
            }
          });
        }
        KeyMaster('command+l, ctrl+l', function (event) {
          event.preventDefault();
          receiver.selection.selectLine();
        });
        KeyMaster('command+d, ctrl+d', function (event) {
          event.preventDefault();
          receiver.selection.selectWord();
        });
        KeyMaster('command+e, ctrl+e', function (event) {
          event.preventDefault();
          receiver.selection.selectPhrase();
        });
        KeyMaster('command+a, ctrl+a', function (event) {
          event.preventDefault();
          receiver.selection.selectAll();
        });
        KeyMaster('shift+command+d, shift+ctrl+d', function (event) {
          if (File.isLocked) {
            return false;
          }
          event.preventDefault();
          receiver.selection.selectWord();
          UserOp.backspaceHandler(receiver, null, 'delSelection');
        });
      }
      if (File.isNodeHtml) {
        (function () {
          var useCommandKey = File.isMac || File.isMacNode;
          KeyMaster(useCommandKey ? 'command+b' : 'ctrl+b', function (event) {
            if (File.isLocked) {
              return false;
            }
            event.preventDefault();
            receiver.stylize.toggleStyle(NodeDef.TYPE.strong);
          });
          KeyMaster(useCommandKey ? 'command+i' : 'ctrl+i', function (event) {
            if (File.isLocked) {
              return false;
            }
            event.preventDefault();
            receiver.stylize.toggleStyle(NodeDef.TYPE.em);
          });
          KeyMaster(useCommandKey ? 'command+u' : 'ctrl+u', function (event) {
            if (File.isLocked) {
              return false;
            }
            event.preventDefault();
            receiver.stylize.toggleStyle(NodeDef.TYPE.underline);
          });
          KeyMaster(useCommandKey ? 'command+a' : 'ctrl+a', function (event) {
            event.preventDefault();
            if (File.isNodeHtml) {
              ClientCommand.selectAll();
            }
          });
          if (File.isNode) {
            let pasteShortcut = File.option.keys['Paste as Plain Text'] || 'ctrl+shift+v';
            if (pasteShortcut) {
              KeyMaster(pasteShortcut, function (event) {
                ClientCommand.pasteAsPlain();
                event.preventDefault();
              });
            }
            if ('ctrl+v' != (pasteShortcut = File.option.keys.Paste)) {
              KeyMaster(pasteShortcut, function (event) {
                ClientCommand.paste();
                event.preventDefault();
              });
            }
          }
          if (File.isMacNode || File.isLinux) {
            let sourceModeShortcut = File.option.keys['Source Code Mode'] || 'CmdOrCtrl+/';
            KeyMaster(sourceModeShortcut, function (event) {
              File.toggleSourceMode();
              event.preventDefault();
            });
          }
        })();
      }
      $(document)
        .on('dragover', function (dragEvent) {
          dragEvent.originalEvent.dataTransfer.dropEffect = 'none';
        })
        .on('dragstart', function (dropEvent) {
          if (receiver.writingArea.contains(dropEvent.target)) {
            return false;
          }
        })
        .on('drop', function (event) {
          Object.defineProperty(selectDroppedTextRange, 'name', { value: 'a', configurable: true });

          event.stopPropagation();
          event.preventDefault();
          setTimeout(function () {
            receiver.resetPasteboard();
          }, 0);
          var dataTransfer = event.originalEvent.dataTransfer;
          if (receiver.library.draggingItem || dataTransfer.getData('file')) {
            receiver.library.clearDraggingItem();
            return false;
          }
          var htmlContent = dataTransfer.getData('text/html'),
            plainText = dataTransfer.getData('text/plain'),
            items = receiver._pasteboard.files || [];
          function selectDroppedTextRange() {
            var range = document.caretRangeFromPoint(event.originalEvent.x, event.originalEvent.y);
            if (
              range &&
              range.startContainer &&
              (receiver.writingArea == range.startContainer ||
                receiver.writingArea.contains(range.startContainer))
            ) {
              if ('BODY' == document.activeElement.tagName) {
                receiver.writingArea.focus();
              }
              receiver.selection.setRange(range);
              receiver.lastCursor = receiver.selection.buildUndo();
              receiver.refocus();
            }
          }
          items = items || [];
          if (receiver._pasteboard.urlWithTitle) {
            if (!FileAction.isKeyWindow()) {
              return false;
            }
            selectDroppedTextRange();
            UserOp.insertUrlWithTitle(
              receiver,
              receiver._pasteboard.urlWithTitle[0],
              receiver._pasteboard.urlWithTitle[1],
            );
          } else {
            if (receiver._pasteboard.image) {
              if (!FileAction.isKeyWindow()) {
                return false;
              }
              selectDroppedTextRange();
              MediaOp.insertURL(receiver._pasteboard.image);
            } else {
              if (htmlContent) {
                if (!FileAction.isKeyWindow()) {
                  return false;
                }
                selectDroppedTextRange();
                setTimeout(function () {
                  UserOp.pasteHandler(receiver, htmlContent);
                }, 20);
              } else {
                if (items.length || (dataTransfer.files && dataTransfer.files.length)) {
                  if (File.isNodeHtml) {
                    for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                      var filePath = MediaOp.getPathForFile(dataTransfer.files.item(fileIndex));
                      if (filePath) {
                        items.push(filePath);
                      }
                    }
                  } else {
                    if (!items.length) {
                      var uriList = dataTransfer.getData('text/uri-list');
                      if (uriList) {
                        items = items.concat(uriList);
                      }
                    }
                  }
                  if (!items.length) {
                    return false;
                  }
                  FileAction.onDropFile(items, dataTransfer, selectDroppedTextRange);
                } else {
                  if (!plainText) {
                    return false;
                  }
                  if (!FileAction.isKeyWindow()) {
                    return false;
                  }
                  selectDroppedTextRange();
                  setTimeout(function () {
                    UserOp.pasteHandler(receiver, plainText);
                  }, 20);
                }
              }
            }
          }
        })
        .on('paste', this.sessionStr, function (pasteEvent) {
          return (
            !File.isLocked &&
            (receiver.sourceView.inSourceMode
              ? void 0
              : UserOp.pasteHandler(receiver, pasteEvent.originalEvent, File._PasteContentFlag))
          );
        })
        .on('pasteAsPlainText', this.sessionStr, function (pasteEvent) {
          if (File.isLocked) {
            return false;
          }
          if (
            File.isMac &&
            (receiver.sourceView.inSourceMode || isInputComponent(document.activeElement))
          ) {
            bridge.callHandler('window.pasteAsPlainText');
          } else {
            if (!receiver.sourceView.inSourceMode) {
              return UserOp.pasteHandler(receiver, pasteEvent.originalEvent, true);
            }
          }
        })
        .on('copy', this.sessionStr, function (event) {
          console.debug('on copy');
          if (!isInputComponent(document.activeElement)) {
            UserOp.beforeCopyStart(receiver);
            UserOp.copyHandler(receiver, event.originalEvent);
          }
          event.stopPropagation();
        })
        .on('copy', function (copyEvent) {
          if (
            copyEvent.target == document.body &&
            receiver.writingArea.contains(document.activeElement) &&
            document.activeElement != copyEvent.target
          ) {
            if (!isInputComponent(document.activeElement)) {
              UserOp.copyHandler(receiver, copyEvent.originalEvent);
            }
          }
        })
        .on('cut', function (cutEvent) {
          if (
            cutEvent.target == document.body &&
            receiver.writingArea.contains(document.activeElement) &&
            document.activeElement != cutEvent.target
          ) {
            if (!isInputComponent(document.activeElement)) {
              UserOp.copyHandler(receiver, cutEvent.originalEvent);
              UserOp.backspaceHandler(receiver, cutEvent, 'delSelection');
            }
          }
        })
        .on('cut', this.sessionStr, function (event) {
          Object.defineProperty(cutSelectedContent, 'name', { value: 'n', configurable: true });

          event.stopPropagation();
          if (File.isLocked) {
            return false;
          }
          if (isInputComponent(document.activeElement)) {
            return true;
          }
          function cutSelectedContent() {
            let selectionSnapshot =
                File._CopyContentRange && receiver.selection.buildUndo(File._CopyContentRange),
              cutCommand = UserOp.backspaceHandler(receiver, null, 'delSelection');
            if (cutCommand && File._CopyContentRange) {
              cutCommand.undo.unshift(selectionSnapshot);
              let cleanupCommand = UserOp.backspaceHandler(receiver, null, true, true);
              if (cleanupCommand) {
                UndoManager.append(cutCommand, cleanupCommand);
              }
            }
          }
          if (File.isNode) {
            File._CopyContentFlag = 'cut_before';
            File._CopyContentRange = null;
            JSBridge.invoke('webContents.copy');
            return false;
          }
          receiver.refocus(void 0, true, true);
          if (UserOp.copyHandler(receiver, event.originalEvent, cutSelectedContent)) {
            cutSelectedContent();
          }
        })
        .on('contextmenu', function (pointerEvent) {
          if (File.isMac) {
            if ('TITLEBAR' == pointerEvent.target.tagName) {
              return;
            }
            var menuItems = [];
            if (File.isWK && 'IFRAME' == pointerEvent.target.tagName) {
              var elementAtPoint = document.elementFromPoint(
                pointerEvent.clientX,
                pointerEvent.clientY,
              );
              menuItems = receiver.contextMenu.getMenuItemsForMac(elementAtPoint);
            } else {
              menuItems = receiver.contextMenu.getMenuItemsForMac(pointerEvent.target);
            }
            if (0 == menuItems.length) {
              pointerEvent.preventDefault();
              pointerEvent.stopPropagation();
            } else {
              window.bridge.callSync('contextMenu.setItems', menuItems);
            }
          }
        })
        .on('contextmenu', this.sessionStr, function (doubleClickEvent) {
          var selectionRange,
            element = $(doubleClickEvent.target);
          if (!element.closest('.CodeMirror')[0]) {
            if (
              Node.isType(
                receiver.getMarkElem(doubleClickEvent.target).attr('mdtype'),
                Stylize.CONST.Selectable,
              )
            ) {
              window.getSelection().removeAllRanges();
            } else {
              if (
                (selectionRange = receiver.selection.getRangy()) &&
                '' == selectionRange.toString()
              ) {
                selectionRange.collapse(true);
                selectionRange.select(selectionRange.isBackward);
              }
              if (File.isNodeHtml) {
                File.editor.brush.expand();
              }
            }
          }
          if ('IMG' === doubleClickEvent.target.tagName && element.closest('.md-image').length) {
            $('.md-expand').removeClass('md-expand');
            var imageElement = element.closest('.md-image').addClass('md-expand');
            if (!imageElement.length) {
              return;
            }
            (selectionRange = rangy.createRange()).selectNodeContents(
              imageElement.children('.md-meta')[0],
            );
            receiver.selection.setRange(selectionRange, true);
            File.editor.brush.expand();
          }
          if (File.isNodeHtml) {
            File.editor.contextMenu.show(doubleClickEvent);
          }
        })
        .on('click', '#md-notification .undo-btn', function () {
          receiver.undo.undo();
          document.body.classList.remove('marklyra-show-notification');
        })
        .on('click', '#md-notification .ok-btn', function () {
          document.body.classList.remove('marklyra-show-notification');
        })
        .on('focus', 'body', function (selectEvent) {
          if (selectEvent.target == document.body) {
            return false;
          }
        })
        .on('click', EditHelper.resetClick);
      $(window)
        .on('resize', function () {
          if (!File.suppressResize) {
            if (timerId) {
              clearTimeout(timerId);
            }
            timerId = setTimeout(refreshTableAndTypewriterLayout, 300);
          }
        })
        .on('mouseup', function (pointerEvent) {
          receiver.selection.clearGlobalColumn();
          receiver.stopScrolling();
          if (1 == pointerEvent.which) {
            receiver.wordCount.updateInSelection();
          }
        });
      window.addEventListener('mac.enterFullscreen', function () {
        $('body').addClass('marklyra-fullscreen');
        $('#top-hotpot, #bottom-hotpot').show();
      });
      window.addEventListener('mac.exitFullscreen', function () {
        $('body').removeClass('marklyra-fullscreen');
        $('#top-hotpot, #bottom-hotpot').hide();
      });
      if (File.isMac) {
        $('#top-hotpot').on('mouseenter', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            receiver.startScrolling(true);
          }
        });
        $('#bottom-hotpot').on('mouseenter', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            receiver.startScrolling(false);
          }
        });
        $('#top-hotpot').on('mouseleave', function (unusedParameter1) {
          receiver.stopScrolling();
        });
        $('#bottom-hotpot').on('mouseleave', function (pointerEvent) {
          if (!(pointerEvent.screenY + 4 > window.innerHeight)) {
            receiver.stopScrolling();
          }
        });
      }
      $(receiver.sessionStr).on('change', "[type='checkbox']", function () {
        var nodeId = this.parentElement.getAttribute('cid'),
          checked = this.checked;
        if (checked) {
          this.setAttribute('checked', 'checked');
        } else {
          this.removeAttribute('checked');
        }
        receiver.getNode(nodeId).attr('checked', checked, receiver, false);
      });
      document.addEventListener(
        'selectionchange',
        function (unusedParameter1) {
          var selectionRange;
          if (File.isNodeHtml) {
            selectionRange = receiver.selection.getRangy();
            $('svg.in-text-selection').attr('class', '');
            if (selectionRange) {
              selectionRange.getNodes([1], function (domNode) {
                if ('svg' === domNode.tagName) {
                  domNode.classList.add('in-text-selection');
                }
              });
            }
          }
          if (File.isFocusMode) {
            enterFocusMode.call(receiver);
          }
        },
        false,
      );
    }
    _bindKeyEvents() {
      Object.defineProperty(updateLinkPointerStyle, 'name', { value: 's', configurable: true });
      Object.defineProperty(lockEditableNode, 'name', { value: 'm', configurable: true });

      var timerId,
        focusCid,
        currentTimerId,
        shortCompositionRange,
        receiver = this,
        keyupSeen = false,
        shiftPressed = false;
      function updateLinkPointerStyle(showPointer) {
        fastdom.mutate(function () {
          document
            .querySelector('#write')
            .querySelectorAll('a, .md-def-url, .md-url')
            .forEach(function (item) {
              item.style.cursor = showPointer ? 'pointer' : '';
            });
        });
      }
      receiver.isIME = 0;
      receiver.lastKeydownEvent = null;
      $(document.body).on('keydown', function (keyboardEvent) {
        if (!(keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey)) {
          receiver.library.outline.autoHideOutline();
          var classList = document.body.classList;
          if (
            classList.contains('marklyra-show-word-count') ||
            classList.contains('marklyra-show-spell-check')
          ) {
            classList.remove('marklyra-show-word-count');
            classList.remove('marklyra-show-spell-check');
          }
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if (EditHelper.keyOnControl(keyNames[keyCode], keyboardEvent)) {
            return false;
          }
          if (
            document.activeElement == document.body &&
            !document.body.classList.contains('modal-open')
          ) {
            var range = window.getSelection();
            if (!range || !range.startContainer || !receiver.writingArea.contains(startContainer)) {
              return false;
            }
            var scrollTop = $('content').scrollTop();
            receiver.writingArea.focus();
            if (
              !(
                'Delete' != keyNames[keyCode] &&
                'Backspace' != keyNames[keyCode] &&
                'Enter' != keyNames[keyCode]
              )
            ) {
              console.debug('keydown on document.body ?');
              if (keyboardEvent.originalEvent != receiver.lastKeydownEvent) {
                keyboardEvent.target = receiver.writingArea;
                receiver.lastKeydownEvent = keyboardEvent.originalEvent;
                $(receiver.sessionStr).trigger(keyboardEvent);
              }
              keyboardEvent.preventDefault();
            }
            if ('IFRAME' == keyboardEvent.target.tagName) {
              keyboardEvent.stopPropagation();
            }
            $('content').scrollTop(scrollTop);
          }
          return (
            !(
              receiver &&
              receiver.contextMenu &&
              receiver.contextMenu.handleKeyEvent(keyboardEvent)
            ) && void 0
          );
        }
      });
      var writingAreaWasEditable,
        editableSnapshot,
        localTimerId,
        compositionInputState = 0,
        handleCompositionEnd = Object.defineProperty(
          function (compositionEvent) {
            if (receiver.isIME && !isInputComponent(document.activeElement)) {
              receiver.useIMEKeyboard = true;
              if (compositionEvent) {
                compositionInputState = -1;
                setTimeout(function () {
                  compositionInputState = 0;
                }, 0);
              }
              console.debug('compositionEnd');
              var range,
                currentElement,
                compositionNode,
                element = receiver.getMarkElem();
              if (!element.length) {
                range = receiver.selection.getRangy();
                currentElement = $(range.startContainer).closest('[cid]');
                if ((compositionNode = receiver.findNodeByElem(currentElement))) {
                  currentElement.replaceWith(compositionNode.toHTML());
                }
              }
              receiver.focusCid = element.attr('cid');
              receiver.brush.addToQueue(receiver.focusCid);
              receiver.isIME = 0;
              setTimeout(function () {
                receiver.brush.brushQueue();
              }, 10);
              receiver.undo.addSnap(receiver.focusCid, SnapFlag.ADD);
            }
          },
          'name',
          { value: 'h', configurable: true },
        ),
        handleCompositionStart = Object.defineProperty(
          function (compositionEvent) {
            if (compositionEvent) {
              compositionInputState = -1;
            }
            if (!(isInputComponent(document.activeElement) || receiver.isIME)) {
              console.debug('compositionStart');
              receiver.selection.prepNode('', compositionEvent, false, true);
              receiver.isIME = 1;
            }
          },
          'name',
          { value: 'p', configurable: true },
        ),
        restoreEditableSnapshot = Object.defineProperty(
          function () {
            if (editableSnapshot && true !== editableSnapshot) {
              if (editableSnapshot[1]) {
                editableSnapshot[0].attr('contenteditable', editableSnapshot[1]);
                if (editableSnapshot[2]) {
                  editableSnapshot[2].attr('contenteditable', editableSnapshot[3]);
                }
              } else {
                editableSnapshot[0].removeAttr('contenteditable');
                if (editableSnapshot[2]) {
                  editableSnapshot[2].removeAttr('contenteditable');
                }
              }
              if (editableSnapshot[4]) {
                receiver.selection.setRange(editableSnapshot[4]);
              }
            }
            editableSnapshot = false;
            if (localTimerId) {
              clearTimeout(localTimerId);
            }
            localTimerId = null;
          },
          'name',
          { value: 'f', configurable: true },
        );
      function lockEditableNode(element) {
        if (localTimerId) {
          clearTimeout(localTimerId);
        }
        element = element || receiver.findElemById(receiver.focusCid);
        console.debug('lock', element[0]);
        var editableAttribute = element.attr('contenteditable'),
          selectionRange = receiver.selection.getRangy();
        if ((editableSnapshot = 'false' !== editableAttribute)) {
          element.attr('contenteditable', 'false');
          editableSnapshot = [element, editableAttribute, null, null, selectionRange];
        }
        localTimerId = setTimeout(restoreEditableSnapshot, 100);
      }
      $(receiver.sessionStr)
        .on('keydown', function (keyboardEvent) {
          receiver.lastKeydownEvent = keyboardEvent.originalEvent;
          receiver.keypressMsg = null;
          var searchValue = keyboardEvent.keyCode || keyboardEvent.which,
            isInputTarget = isInputComponent(keyboardEvent.target);
          if (229 != searchValue) {
            if (
              !('Tab' != keyNames[searchValue] || keyboardEvent.ctrlKey || keyboardEvent.altKey)
            ) {
              keyboardEvent.stopPropagation();
            }
            if (
              receiver &&
              receiver.contextMenu &&
              receiver.contextMenu.handleKeyEvent(keyboardEvent)
            ) {
              return false;
            }
            if (
              receiver.autoComplete &&
              false === receiver.autoComplete.handleKeyEvents(keyboardEvent)
            ) {
              return false;
            }
            if (EditHelper.keyOnControl(keyNames[searchValue], keyboardEvent, true)) {
              return false;
            }
            if (document.body.classList.contains('megamenu-opened')) {
              if ('Esc' === keyNames[searchValue]) {
                File.megaMenu.hide();
              }
            } else {
              $('.dropdown-menu.open:not(#marklyra-sidebar), .dropdown-menu.show')
                .removeClass('open')
                .removeClass('show')
                .find('.active')
                .removeClass('active');
              $('.marklyra-tooltip').removeClass('shown');
              if (!('Ctrl' != keyNames[searchValue] && 'Command' != keyNames[searchValue])) {
                updateLinkPointerStyle(true);
              }
              if (Node.isType(keyNames[searchValue], 'Right', 'Left', 'Up', 'Down')) {
                if ($('.context-menu.show').length) {
                  receiver.contextmenu.handleArrowKey(keyNames[searchValue]);
                }
                if (
                  keyboardEvent.target.classList &&
                  keyboardEvent.target.classList.contains('marklyra-input') &&
                  !keyboardEvent.ctrlKey &&
                  !keyboardEvent.metaKey
                ) {
                  range = receiver.selection.getRangy();
                  if (
                    'Left' == keyNames[searchValue] &&
                    0 == range.startOffset &&
                    0 == range.endOffset
                  ) {
                    receiver.selection.moveUpOrDown(true, keyboardEvent, true);
                    return false;
                  }
                  if (
                    'Right' == keyNames[searchValue] &&
                    range.startOffset == range.endOffset &&
                    range.endOffset == keyboardEvent.target.textContent.length
                  ) {
                    receiver.selection.moveUpOrDown(false, keyboardEvent, true);
                    return false;
                  }
                }
                if (isInputTarget && Node.isType(keyNames[searchValue], 'Right', 'Left')) {
                  return;
                }
                if (File.isLocked) {
                  return true;
                }
                if (
                  File.inBusyMode &&
                  keyboardEvent &&
                  (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK)
                ) {
                  setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true');
                }
                if (
                  $((receiver.selection.getRangy() || {}).commonAncestorContainer).closest(
                    'table.md-table',
                  ).length &&
                  false === receiver.tableEdit.keydownHandler(keyboardEvent)
                ) {
                  return false;
                }
                if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
                  if (
                    File.isMac &&
                    keyboardEvent.metaKey &&
                    !keyboardEvent.ctrlKey &&
                    !keyboardEvent.altKey &&
                    ('Up' == keyNames[searchValue] || 'Down' == keyNames[searchValue])
                  ) {
                    if ('Up' == keyNames[searchValue]) {
                      receiver.selection.jumpTop(keyboardEvent.shiftKey);
                    } else {
                      receiver.selection.jumpBottom(keyboardEvent.shiftKey);
                    }
                    return false;
                  }
                  if (
                    keyboardEvent.target.classList &&
                    keyboardEvent.target.classList.contains('md-def-name') &&
                    'Right' === keyNames[searchValue]
                  ) {
                    receiver.selection.jumpIntoElemEnd($(keyboardEvent.target).closest('[mdtype]'));
                    return false;
                  }
                }
                if (File.isMac && keyboardEvent.metaKey) {
                  var syntheticKeyup = {};
                  $.extend(syntheticKeyup, keyboardEvent);
                  syntheticKeyup.type = 'keyup';
                  setTimeout(function () {
                    $(keyboardEvent.target).trigger(syntheticKeyup);
                  }, 10);
                }
                if (keyboardEvent.shiftKey) {
                  receiver.needRemoveMathAfterSym = true;
                  $('.md-focus .math-jax-postprocess>.md-math-after-sym').text('​');
                }
                if ('Right' == keyNames[searchValue] || 'Left' == keyNames[searchValue]) {
                  receiver.lastCursor = receiver.selection.buildUndo();
                  if (receiver.autoComplete.isShown()) {
                    receiver.brush.triggerAutoComplete();
                  }
                  receiver.selection.moveLeftOrRight(
                    'Left' == keyNames[searchValue],
                    keyboardEvent,
                  );
                } else {
                  if (!('Up' != keyNames[searchValue] && 'Down' != keyNames[searchValue])) {
                    receiver.lastCursor = receiver.selection.buildUndo();
                    if (keyboardEvent.shiftKey) {
                      receiver.selection.unlockBlockUpOrDown(
                        'Up' == keyNames[searchValue],
                        keyboardEvent,
                      );
                    } else {
                      if (keyboardEvent.altKey || keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
                        KeyMaster.dispatchEvent(keyboardEvent);
                      }
                      if (!keyboardEvent.isDefaultPrevented()) {
                        receiver.selection.moveUpOrDown(
                          'Up' == keyNames[searchValue],
                          keyboardEvent,
                        );
                      }
                    }
                  }
                }
              }
              if (!isInputTarget) {
                if ('Esc' == keyNames[searchValue]) {
                  if ($('#table-insert-dialog:visible').modal('hide').length) {
                    return void $(File.editor.sessionStr).trigger('cursorChange');
                  }
                  receiver.brush.triggerAutoComplete(true);
                  keyboardEvent.preventDefault();
                } else {
                  if ('Tab' == keyNames[searchValue]) {
                    if (keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey) {
                      return;
                    }
                    keyboardEvent.preventDefault();
                    if (
                      !(keyboardEvent.shiftKey
                        ? UserOp.lessIndent(receiver)
                        : UserOp.moreIndent(receiver))
                    ) {
                      if ((currentElement = receiver.getMarkElem()).closest('.md-table').length) {
                        receiver.tableEdit.moveToNextCell(
                          true,
                          keyboardEvent.shiftKey,
                          void 0,
                          true,
                        );
                      } else {
                        if (
                          currentElement.hasClass('md-def-link') ||
                          currentElement.hasClass('md-def-footnote')
                        ) {
                          var element = receiver
                            .getJQueryElem(window.getSelection().anchorNode)
                            .closest('span[contenteditable]');
                          if (keyboardEvent.shiftKey) {
                            receiver.selection.selectAllElem(
                              $(element.prevAll("span[contenteditable='true']")[0]),
                            );
                          } else {
                            receiver.selection.selectAllElem(
                              $(element.nextAll("span[contenteditable='true']")[0]),
                            );
                          }
                        } else {
                          if (!keyboardEvent.shiftKey) {
                            UserOp.pasteHandler(receiver, '\t', true, true, true);
                            receiver.refocus();
                            receiver.brush.addToQueue(receiver.focusCid);
                          }
                        }
                      }
                    }
                  } else {
                    if ('Backspace' == keyNames[searchValue] || 'Delete' == keyNames[searchValue]) {
                      if (File.bundle.isLocked) {
                        return void keyboardEvent.preventDefault();
                      }
                      var currentElement,
                        deletionResult = true;
                      if (
                        keyboardEvent.shiftKey &&
                        File.isNode &&
                        !keyboardEvent.ctrlKey &&
                        'Delete' == keyNames[searchValue]
                      ) {
                        return;
                      }
                      if (File.isNodeHtml) {
                        if (
                          keyboardEvent.ctrlKey &&
                          (receiver.selection.getRangy() || {}).collapsed
                        ) {
                          UserOp.backspaceHandler(receiver, keyboardEvent, keyNames[searchValue]);
                        } else {
                          deletionResult = UserOp.backspaceHandler(
                            receiver,
                            keyboardEvent,
                            keyNames[searchValue],
                            false,
                            true,
                          );
                        }
                      } else {
                        if (keyboardEvent.metaKey) {
                          (currentElement = receiver.getMarkElem(
                            window.getSelection().commonAncestorContainer,
                          )).addClass('md-expand');
                          window.getSelection().modify('extend', 'backward', 'lineboundary');
                          UserOp.backspaceHandler(receiver, keyboardEvent, keyNames[searchValue]);
                        } else {
                          deletionResult = UserOp.backspaceHandler(
                            receiver,
                            keyboardEvent,
                            keyNames[searchValue],
                            false,
                            true,
                          );
                        }
                      }
                      if (null === deletionResult) {
                        false;
                        receiver.undo.addSnap(receiver.focusCid, SnapFlag.NONE);
                        receiver.brush.addToQueue(receiver.focusCid);
                      } else {
                        keyboardEvent.preventDefault();
                      }
                      keyboardEvent.stopPropagation();
                    } else {
                      if (
                        'Enter' == keyNames[searchValue] ||
                        (File.isMac &&
                          !keyboardEvent.shiftKey &&
                          !keyboardEvent.metaKey &&
                          keyboardEvent.ctrlKey &&
                          'O' == String.fromCharCode(searchValue))
                      ) {
                        if (1 == $('.marklyra-focusable-btn.selected').length) {
                          var range;
                          if (
                            (range = receiver.selection.getRangy()).startContainer.classList &&
                            range.startContainer.classList.contains('marklyra-focusable-btn')
                          ) {
                            $(range.startContainer).trigger('btn-action');
                            return void keyboardEvent.preventDefault();
                          }
                          $('.marklyra-focusable-btn.selected').trigger('btn-action');
                        }
                        pressReturn.call(
                          receiver,
                          keyboardEvent.metaKey || keyboardEvent.ctrlKey,
                          keyboardEvent.shiftKey,
                          'O' == String.fromCharCode(searchValue),
                        );
                        keyboardEvent.preventDefault();
                        keyboardEvent.stopPropagation();
                      }
                    }
                  }
                }
                if (
                  keyupSeen &&
                  searchValue == this.lastKey &&
                  [224, 17, 91, 93].indexOf(searchValue) > -1 &&
                  this.lastKeyTime &&
                  performance.now() - this.lastKeyTime < 300
                ) {
                  keyboardEvent.preventDefault();
                  receiver.refocus(void 0, true);
                  this.lastKey = 0;
                } else {
                  this.lastKey = keyboardEvent.keyCode;
                  this.lastKeyTime = performance.now();
                }
                keyupSeen = false;
              }
            }
          }
        })
        .on('keypress', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if (File.isLocked && keyboardEvent.charCode > 0) {
            return keyboardEvent.ctrlKey || keyboardEvent.metaKey;
          }
          if (!isInputComponent(keyboardEvent.target) && !KeyMaster.isCommand(keyboardEvent)) {
            if ('Enter' == keyNames[keyCode]) {
              keyboardEvent.preventDefault();
            } else {
              if (keyboardEvent.charCode > 0) {
                if (receiver.selection.getRangy()) {
                  String.fromCharCode(keyboardEvent.charCode);
                  var nodeId = receiver.getMarkElem().attr('cid');
                  if (nodeId != receiver.focusCid) {
                    receiver.refocus(nodeId);
                  }
                  receiver.brush.addToQueue(receiver.focusCid);
                }
              }
            }
          }
        })
        .on('keyup', function (keyboardEvent) {
          keyupSeen = true;
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if (!isInputComponent(keyboardEvent.target)) {
            if (!('CTRL' != keyNames[keyCode] && 'Command' != keyNames[keyCode])) {
              updateLinkPointerStyle(false);
            }
            if (
              'Right' == keyNames[keyCode] ||
              'Left' == keyNames[keyCode] ||
              'Up' == keyNames[keyCode] ||
              'Down' == keyNames[keyCode] ||
              'Home' == keyNames[keyCode] ||
              'End' == keyNames[keyCode] ||
              'PageUp' == keyNames[keyCode] ||
              'PageDown' == keyNames[keyCode]
            ) {
              if (
                !(shiftPressed = keyboardEvent.shiftKey) &&
                !receiver.isIME &&
                !keyboardEvent.metaKey
              ) {
                receiver.refocus();
              }
            } else {
              if (shiftPressed && 'Shift' == keyNames[keyCode]) {
                shiftPressed = false;
                if (!receiver.isIME && !keyboardEvent.metaKey) {
                  receiver.refocus();
                }
              }
            }
            if ('Enter' == keyNames[keyCode]) {
              (function () {
                var element = $('#write .md-focus');
                if (0 == element.length) {
                  var range = receiver.selection.getRangy();
                  if (!range) {
                    return;
                  }
                  element = $(range.startContainer).closest('[cid]');
                  element = $("[cid='" + element.attr('cid') + "']");
                }
                if (
                  element.length > 1 &&
                  element.get(0).getAttribute('cid') === element.get(1).getAttribute('cid')
                ) {
                  element
                    .filter(function (item) {
                      return item > 0;
                    })
                    .remove();
                  receiver.selection.jumpIntoElemEnd($(element.get(0)));
                  pressReturn.call(
                    receiver,
                    File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey,
                    keyboardEvent.shiftKey,
                  );
                } else {
                  if (element.next("div:not('[mdtype]')").remove().length) {
                    pressReturn.call(
                      receiver,
                      File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey,
                      keyboardEvent.shiftKey,
                    );
                  }
                }
              })();
            }
          }
        })
        .on('compositionend', handleCompositionEnd)
        .on('compositionstart', handleCompositionStart)
        .on('compositionupdate', function () {})
        .on('beforeinput', function (event) {
          Object.defineProperty(replaceTargetRangeText, 'name', { value: 'h', configurable: true });

          editableSnapshot = false;
          shortCompositionRange = false;
          receiver.lastKeydownEvent = null;
          if (!isInputComponent(event.target)) {
            if (!receiver.focusCid) {
              receiver.refocus(void 0, false, true);
            }
            var inputType = event.originalEvent && event.originalEvent.inputType;
            if (!event.originalEvent) {
              inputType = 'deleteContentBackward';
            }
            if (!inputType && null == event.originalEvent.data && receiver.isIME && File.isMac) {
              receiver.isIME = 0;
              return void lockEditableNode();
            }
            if ('deleteCompositionText' != inputType && 'deleteByComposition' != inputType) {
              if ('insertFromPaste' == inputType) {
                var dataTransfer = (event.originalEvent || {}).dataTransfer;
                if (File.isMac && dataTransfer) {
                  if (dataTransfer.getData) {
                    receiver.UserOp.pasteHandler(
                      receiver,
                      StringUtils.orDefault(
                        dataTransfer.getData('text/html') || dataTransfer.getData('text/plain'),
                        event.originalEvent,
                      ),
                    );
                  } else {
                    if (dataTransfer.get) {
                      receiver.UserOp.pasteHandler(
                        receiver,
                        StringUtils.orDefault(
                          dataTransfer.get('text/html') || dataTransfer.get('text/plain'),
                          event.originalEvent,
                        ),
                      );
                    } else {
                      receiver.UserOp.pasteHandler(receiver, event.originalEvent);
                    }
                  }
                } else {
                  receiver.UserOp.pasteHandler(receiver, event.originalEvent);
                }
                return void lockEditableNode();
              }
              if ('insertFromDrop' == inputType) {
                receiver.UserOp.pasteHandler(receiver, event.originalEvent);
              } else {
                if ('insertFromComposition' == inputType) {
                } else {
                  if (/composition/i.exec(inputType || '')) {
                    if (/\n/.exec(event.originalEvent.data || '')) {
                      return void lockEditableNode();
                    }
                    !(function () {
                      var currentElement = $('.md-meta-block');
                      if (currentElement.next().attr('cid') === receiver.focusCid) {
                        var editableAttribute = currentElement.attr('contenteditable');
                        editableSnapshot = [currentElement, editableAttribute];
                        currentElement.attr('contenteditable', 'false');
                        localTimerId = setTimeout(restoreEditableSnapshot, 100);
                      }
                    })();
                    handleCompositionStart(event);
                  } else {
                    if ('insertReplacementText' == inputType) {
                      var text = event.originalEvent.dataTransfer.getData('text/plain') || '';
                      if (/[\n\r]/.exec(text)) {
                        replaceTargetRangeText(text);
                      }
                      if (
                        (range = event.originalEvent.getTargetRanges()[0]) &&
                        text.length &&
                        text[0] !== text[0].toLowerCase() &&
                        text.substr(1) == text.toLowerCase().substr(1)
                      ) {
                        if (
                          range.startContainer == range.endContainer &&
                          3 == range.startContainer.nodeType &&
                          range.startContainer.parentElement &&
                          range.endOffset - range.startOffset
                        ) {
                          if ('SCRIPT' == range.startContainer.parentElement.tagName) {
                            return void lockEditableNode();
                          }
                          var textSlice = range.startContainer.textContent.substr(
                              range.startOffset,
                              range.endOffset,
                            ),
                            currentTextSlice = range.startContainer.textContent.substr(
                              0,
                              range.startOffset,
                            );
                          if (!currentTextSlice.trim()) {
                            let element = range.startContainer.parentElement.closest('[mdtype]'),
                              substringLength = receiver.selection.getOffset(element, range);
                            if (
                              element &&
                              ((currentTextSlice = $(element)
                                .rawText()
                                .substr(0, substringLength)
                                .trim()),
                              /\$$/.exec(currentTextSlice))
                            ) {
                              if (textSlice.replace(/\s*$/, '') == text.toLowerCase()) {
                                return void lockEditableNode();
                              }
                              replaceTargetRangeText(text);
                            }
                          }
                        }
                      } else {
                        if (range && range.endOffset - range.startOffset < 2) {
                          shortCompositionRange = true;
                        }
                      }
                    } else {
                      if ('insertText' == inputType) {
                        if (
                          !((range = event.originalEvent.getTargetRanges()[0]) && range.collapsed)
                        ) {
                          receiver.undo.endSnap();
                        }
                        if (/[\r\n]/.exec(event.originalEvent.data || '')) {
                          replaceTargetRangeText(event.originalEvent.data);
                        } else {
                          receiver.selection.prepNode(event.originalEvent.data || '', event);
                          if (receiver.focusCid) {
                            receiver.undo.addSnap(receiver.focusCid, SnapFlag.NONE);
                          }
                        }
                      } else {
                        if (/deleteContent/.exec(inputType)) {
                          var range;
                          if (
                            (range = receiver.selection.getRangy()) &&
                            !range.collapsed &&
                            range.commonAncestorContainer &&
                            range.commonAncestorContainer.querySelector &&
                            range.commonAncestorContainer.querySelector('[cid]')
                          ) {
                            console.warn('detect deletion from IME');
                            lockEditableNode($(range.commonAncestorContainer));
                            return void window.getSelection().removeAllRanges();
                          }
                        } else {
                          if (inputType) {
                            event.preventDefault();
                            event.stopPropagation();
                          }
                        }
                      }
                    }
                  }
                }
              }
            } else {
              !(function () {
                if (
                  (writingAreaWasEditable =
                    'false' !== receiver.writingArea.getAttribute('contenteditable'))
                ) {
                  receiver.writingArea.setAttribute('contenteditable', 'false');
                }
                if (receiver.focusCid) {
                  var nodeElement = receiver.findElemById(receiver.focusCid);
                  if (
                    nodeElement.hasClass('md-def-link') ||
                    nodeElement.hasClass('md-def-footnote')
                  ) {
                    nodeElement.attr('contenteditable', 'false');
                  } else {
                    if (nodeElement.parent().is('th,td,li')) {
                      restoreEditableSnapshot();
                      var currentElement = nodeElement.parent(),
                        editableAttribute = currentElement.attr('contenteditable');
                      if ((editableSnapshot = 'false' !== editableAttribute)) {
                        currentElement.attr('contenteditable', 'false');
                        if (currentElement.is('th,td')) {
                          currentElement.parent().attr('contenteditable', 'false');
                          editableSnapshot = [
                            currentElement,
                            editableAttribute,
                            currentElement.parent(),
                            editableAttribute,
                          ];
                        } else {
                          editableSnapshot = [currentElement, editableAttribute];
                        }
                        localTimerId = setTimeout(restoreEditableSnapshot, 100);
                      }
                    }
                  }
                }
              })();
            }
          }
          function replaceTargetRangeText(plainText) {
            var currentRange = event.originalEvent.getTargetRanges()[0];
            if (currentRange) {
              var localRange = rangy.createRange();
              localRange.setStart(currentRange.startContainer, currentRange.startOffset);
              localRange.setEnd(currentRange.endContainer, currentRange.endOffset);
              receiver.selection.setRange(localRange, true);
            }
            receiver.UserOp.pasteHandler(receiver, plainText, true);
            lockEditableNode();
          }
        })
        .on('input', function (inputEvent) {
          Object.defineProperty(syncNodeHtml, 'name', { value: 'm', configurable: true });

          receiver.lastKeydownEvent = null;
          if (isInputComponent(inputEvent.target)) {
            restoreEditableSnapshot();
          } else {
            restoreEditableSnapshot();
            if (
              !(
                (inputEvent && inputEvent.target && 'VIDEO' == inputEvent.target.tagName) ||
                'IMG' == inputEvent.target.tagName
              )
            ) {
              if (writingAreaWasEditable) {
                receiver.writingArea.setAttribute('contenteditable', 'true');
              }
              receiver.selection.clearGlobalColumn();
              var inputType =
                (inputEvent.originalEvent && inputEvent.originalEvent.inputType) || '';
              if (!inputEvent.originalEvent) {
                inputType = 'deleteContentBackward';
              }
              var NONE = SnapFlag.NONE;
              if ('insertReplacementText' == inputType) {
                if (
                  (function (text) {
                    if (/[\n\r]/.exec(text || '')) {
                      return true;
                    }
                  })(inputEvent.originalEvent.dataTransfer.getData('text/plain'))
                ) {
                  return false;
                }
                NONE = shortCompositionRange ? SnapFlag.ADD : SnapFlag.REPLACE;
              } else {
                if ('deleteCompositionText' == inputType) {
                  return;
                }
                NONE =
                  /insert/.exec(inputType) || /composition/i.exec(inputType)
                    ? SnapFlag.ADD
                    : /deleteContent/.exec(inputType)
                      ? SnapFlag.DELETE
                      : SnapFlag.REPLACE;
              }
              shortCompositionRange = false;
              if (receiver.focusCid) {
                var element = $(inputEvent.target).closest('[cid]'),
                  currentFocusCid = element.attr('cid');
                if (
                  currentFocusCid &&
                  receiver.focusCid != currentFocusCid &&
                  !element[0].querySelector("[cid='" + currentFocusCid + "']")
                ) {
                  receiver.refocus(currentFocusCid, false, true);
                }
              } else {
                receiver.refocus(void 0, false, true);
              }
              if (
                'insertFromPaste' != inputType &&
                'insertCompositionText' != inputType &&
                (compositionInputState > 0 || (receiver.isIME && 'insertText' == inputType)
                  ? ((compositionInputState = 0), handleCompositionEnd())
                  : receiver.brush.addToQueue(receiver.focusCid),
                receiver.focusCid)
              ) {
                receiver.undo.addSnap(receiver.focusCid, NONE);
                var match = /deleteContent/.exec(inputType);
                if (!match) {
                  receiver.UserOp.PunctuationOp.clearLastQuoteState();
                }
                if (currentTimerId) {
                  clearTimeout(currentTimerId);
                }
                currentTimerId = setTimeout(
                  function () {
                    receiver.selection.lockNativeScroll();
                    if (File.isTypeWriterMode) {
                      receiver.selection.typeWriterScroll(null, 0);
                    } else {
                      if (!match) {
                        console.debug('editor.selection.scrollAdjust');
                        receiver.selection.scrollAdjust();
                      }
                    }
                    currentTimerId = null;
                  },
                  (File.inBusyMode ? 200 : 20) * (File.isMac ? 10 : 1),
                );
                if (receiver.wordCount.delimiter < WordCount.Delimiter.LINE) {
                  receiver.wordCount.quickUpdate(receiver.focusCid);
                }
                if (timerId) {
                  clearTimeout(timerId);
                  timerId = null;
                }
                if (focusCid && receiver.focusCid != focusCid) {
                  syncNodeHtml(focusCid);
                }
                focusCid = receiver.focusCid;
                timerId = setTimeout(function () {
                  syncNodeHtml(focusCid);
                  focusCid = null;
                  timerId = null;
                }, 200);
              }
            }
          }
          function syncNodeHtml(nodeId) {
            receiver.syncChange([
              { type: 'sync', id: nodeId, html: receiver.findElemById(nodeId).html() },
            ]);
          }
        })
        .on('drop', function (event) {
          var droppedFile = null;
          if (
            (droppedFile =
              (File.isWK && event.originalEvent.dataTransfer.getData('file')) ||
              receiver.library.draggingItem)
          ) {
            var range = document.caretRangeFromPoint(event.originalEvent.x, event.originalEvent.y);
            if (
              range &&
              range.startContainer &&
              (receiver.writingArea == range.startContainer ||
                receiver.writingArea.contains(range.startContainer))
            ) {
              receiver.selection.setRange(range);
              receiver.refocus();
              if ('BODY' == document.activeElement.tagName) {
                receiver.writingArea.focus();
              }
            }
            setTimeout(function () {
              UserOp.insertFileLink(receiver, droppedFile);
            }, 20);
            receiver.library.clearDraggingItem();
            event.stopPropagation();
            return void event.preventDefault();
          }
        })
        .on('dragover', function (event) {
          if (event.originalEvent.dataTransfer.types.indexOf('file') > -1) {
            event.preventDefault();
            event.stopPropagation();
          }
        })
        .on('dragenter', function (event) {
          if (
            !(
              this == document.activeElement ||
              this.contains(document.activeElement) ||
              document.activeElement.contains(this)
            )
          ) {
            receiver.restoreLastCursor();
            event.preventDefault();
            event.stopPropagation();
          }
        });
    }
    setCurLinkElem(linkElement) {
      $curLinkElem = linkElement;
    }
    getCurrentLinkHref() {
      var domNode = this.selection.getRangy().commonAncestorContainer;
      if (!domNode.closest) {
        domNode = domNode.parentElement;
      }
      var linkHref = '';
      if (!(domNode = domNode.closest('.md-link, .md-def-link'))) {
        return '';
      }
      if (domNode.classList.contains('md-def-link')) {
        linkHref = (domNode = domNode.querySelector('.md-def-url')).innerText;
      } else {
        var element = domNode.querySelector('a');
        linkHref = element.getAttribute('href');
        if ('reflink' == domNode.getAttribute('md-inline')) {
          var missingReferenceMessage = $.localize.getString(
              'Need to define the reference link <b>[{0}]</b> with syntax <b>[{1}]: www.example.com</b>',
            ),
            ref = element.dataset.ref;
          if (void 0 === (linkHref = this.nodeMap.link_list.getHrefByRef(ref, true, true))) {
            EditHelper.showNotification(missingReferenceMessage.format(ref, ref), true);
            if (!File.isLocked) {
              this.docMenu.addEmptyDef(ref, NodeDef.TYPE.def_link);
            }
            return null;
          }
          if ('' === linkHref) {
            EditHelper.showNotification(missingReferenceMessage.format(ref, ref), true);
            return null;
          }
        }
      }
      return linkHref;
    }
    openCurrentLink() {
      var linkHref = this.getCurrentLinkHref();
      if (null != linkHref) {
        this.tryOpenUrl(linkHref, true);
      }
    }
    copyCurrentLink() {
      var linkHref = this.getCurrentLinkHref();
      if (null != linkHref) {
        (0, this.UserOp.setClipboard)(null, void 0, linkHref, true);
      }
    }
    tryOpenLink(element, useCurrentLink) {
      if (useCurrentLink) {
        element = $curLinkElem;
      }
      if (element.length) {
        var linkHref = element.attr('href'),
          missingReferenceMessage = $.localize.getString(
            'Need to define the reference link <b>[{0}]</b> with syntax <b>[{1}]: www.example.com</b>',
          );
        if (!linkHref) {
          linkHref = element.attr('xlink:href');
        }
        this.undo.endSnap(true);
        if (element.hasClass('md-footnote')) {
          this.docMenu.jumpToFootnoteDef(element);
          return false;
        }
        if (element.hasClass('reversefootnote')) {
          this.docMenu.jumpToFootnote(
            element.closest('.md-def-footnote'),
            element.attr('data-index') - 0,
          );
          return false;
        }
        if (element.hasClass('md-def-url')) {
          this.tryOpenUrl(element.text());
        } else {
          if (element[0].hasAttribute('data-ref')) {
            var referenceName = element.data('ref');
            if (
              void 0 === (linkHref = this.nodeMap.link_list.getHrefByRef(referenceName, true, true))
            ) {
              EditHelper.showNotification(
                missingReferenceMessage.format(referenceName, referenceName),
                true,
              );
              if (!File.isLocked) {
                this.docMenu.addEmptyDef(referenceName, NodeDef.TYPE.def_link);
              }
              return false;
            }
            if ('' === linkHref) {
              EditHelper.showNotification(
                missingReferenceMessage.format(referenceName, referenceName),
                true,
              );
              return false;
            }
          }
        }
        if (linkHref) {
          this.tryOpenUrl(
            linkHref,
            element.closest("[md-inline='autolink'], [md-inline='url']").length,
          );
        }
      }
    }
    tryOpenUrl(inputText, forceWebUrl) {
      Object.defineProperty(openLocalFileLink, 'name', { value: 's', configurable: true });
      Object.defineProperty(openExternalLink, 'name', { value: 'l', configurable: true });

      var originalUrl = (inputText = inputText.trim().replace(/(^<)|(>$)/g, ''));
      inputText = StringUtils.decodeFromEscapedPath(inputText);
      const supportDomain = File.option.useMirrorInCN ? 'marklyraio.cn' : 'marklyra.io';
      if (!/^javascript:/i.exec(inputText || '')) {
        if (inputText.match(/^#/)) {
          var anchorElement = EditHelper.findAnchorElem(inputText);
          if (anchorElement) {
            this.selection.jumpIntoElemBegin(anchorElement);
            this.selection.scrollAdjust(anchorElement, 10);
          }
        } else {
          if (StringUtils.isFullUrl(inputText)) {
            return openExternalLink();
          }
          {
            var trimmedText = inputText.trim(),
              anchorFragment = (/(#[^./\//]+)$/.exec(trimmedText) || [])[0] || '';
            let localText = (inputText = trimmedText.replace(/([#?][^./\//]+)$/, '')).replace(
              /([#?][^/\//]+)$/,
              '',
            );
            if (inputText != localText) {
              let searchValue = (
                (localText.split(/[\/\\]/) || ['']).last().split('.') || ['']
              ).last();
              if (File.SupportedFiles.indexOf(searchValue) > -1) {
                inputText = localText;
                anchorFragment = (/(#[^/\//]+)$/.exec(trimmedText) || [])[0] || '';
              }
            }
            (function (fileUrl, anchorFragment) {
              if (File.isMac) {
                return (function (text, anchorFragment) {
                  return new Promise(function (resolvePromise, rejectPromise) {
                    bridge.callHandler(
                      'path.openFile',
                      {
                        url: text.replace(/\\/g, '/'),
                        relateToFolder: true,
                        anchor: anchorFragment || '',
                      },
                      function (opened) {
                        if (opened) {
                          resolvePromise();
                        } else {
                          rejectPromise();
                        }
                      },
                    );
                  });
                })(fileUrl, anchorFragment);
              } else {
                return (function (fileUrl, anchorFragment) {
                  var fileSystem = reqnode('fs-plus'),
                    resolvedPath = StringUtils.realPathForTextBundle(fileUrl);
                  if (resolvedPath) {
                    if (fileSystem.existsSync(resolvedPath)) {
                      openLocalFileLink(resolvedPath, anchorFragment);
                      return Promise.resolve();
                    } else {
                      if (fileSystem.isFileSync(resolvedPath + '.md')) {
                        openLocalFileLink(resolvedPath + '.md', anchorFragment);
                        return Promise.resolve();
                      } else {
                        if (fileSystem.isFileSync(resolvedPath + '.markdown')) {
                          openLocalFileLink(resolvedPath + '.markdown', anchorFragment);
                          return Promise.resolve();
                        } else {
                          if (
                            File.option.supportTextBundle &&
                            fileSystem.isFileSync(resolvedPath + '.textbundle')
                          ) {
                            openLocalFileLink(resolvedPath + '.textbundle', anchorFragment);
                            return Promise.resolve();
                          } else {
                            if (
                              File.option.supportTextPack &&
                              fileSystem.isFileSync(resolvedPath + '.textpack')
                            ) {
                              openLocalFileLink(resolvedPath + '.textpack', anchorFragment);
                              return Promise.resolve();
                            } else {
                              return Promise.reject(resolvedPath);
                            }
                          }
                        }
                      }
                    }
                  } else {
                    return Promise.reject(fileUrl);
                  }
                })(fileUrl, anchorFragment);
              }
            })(inputText, anchorFragment).then(
              function () {},
              function (result) {
                if (forceWebUrl) {
                  inputText = /^[A-Za-z.+-]+:/.exec(originalUrl)
                    ? originalUrl
                    : 'https://' + originalUrl;
                  openExternalLink();
                } else {
                  if (
                    !(function (callbackText) {
                      Object.defineProperty(createLinkedFileOrDirectory, 'name', {
                        value: 'o',
                        configurable: true,
                      });

                      var currentText,
                        currentSearchValue,
                        text = callbackText;
                      function createLinkedFileOrDirectory(filePath, createFile) {
                        if (File.isNode) {
                          var fileSystem = reqnode('fs-extra');
                          (createFile ? fileSystem.ensureFile : fileSystem.ensureDir)(
                            filePath,
                            function (error) {
                              if (error) {
                                alert(error.message);
                              } else {
                                openLocalFileLink(filePath);
                              }
                            },
                          );
                        } else {
                          bridge.callHandler(
                            createFile ? 'path.createFileAndOpen' : 'path.createFolderAndOpen',
                            filePath,
                          );
                        }
                      }
                      if (
                        (text = StringUtils.ensureAbsolutePath(
                          File.bundle.filePath || File.bundle.originalPath,
                          callbackText,
                        )) &&
                        (function () {
                          currentText = text
                            .replace(/#([^.\/\\]+)$/, '')
                            .replace(/\?([^.\/\\]+)$/, '');
                          if (
                            !(currentSearchValue = (
                              (/\.([^.\/\\]+)$/.exec(text) || '')[1] || ''
                            ).toLowerCase())
                          ) {
                            let firstPathSegment = (callbackText.split(/[\/\\]/) || [''])[0];
                            if (
                              firstPathSegment.indexOf('.') > 0 ||
                              (firstPathSegment.indexOf(':') > 0 &&
                                File.isWin &&
                                /^[A-Z]{1,2}:/.exec(firstPathSegment))
                            ) {
                              return false;
                            }
                          }
                          return (
                            File.SupportedFiles.indexOf(currentSearchValue) > -1 &&
                            ((currentText = text), true)
                          );
                        })()
                      ) {
                        EditHelper.showNotification(
                          $.localize
                            .getString(
                              'Cannot open location <code>$1</code>, would you want to create file at <code>$2</code> and continue?',
                            )
                            .replace('$2', StringUtils.escape(currentText))
                            .replace('$1', StringUtils.escape(callbackText)) +
                            ` <a href='https://support.${supportDomain}/Links#faq' target="_blank" class='default-btn'>` +
                            $.localize.getString('Learn More…') +
                            '</a>',
                          true,
                          currentSearchValue
                            ? [$.localize.getString('Create File', 'Panel')]
                            : [
                                $.localize.getString('Create Folder', 'Panel'),
                                $.localize.getString('Create File', 'Panel'),
                              ],
                          (buttonIndex) => {
                            if (1 == buttonIndex) {
                              createLinkedFileOrDirectory(text + '.md', true);
                            } else {
                              createLinkedFileOrDirectory(text, !!currentSearchValue);
                            }
                          },
                        );
                        return true;
                      }
                    })(inputText)
                  ) {
                    var suggestedProtocol = 'https://';
                    if (/^\S+@\S+\.\S+$/.exec(inputText) && !/[\\\/]/.exec(inputText)) {
                      suggestedProtocol = 'mailto:';
                    }
                    EditHelper.showNotification(
                      $.localize
                        .getString(
                          "Cannot open location <code>$1</code>, do you mean <a href='$3' target='_blank'>$2</a> ?",
                        )
                        .replace(
                          '$3',
                          suggestedProtocol + StringUtils.escapeForPreWrap(originalUrl),
                        )
                        .replace('$2', suggestedProtocol + StringUtils.escape(originalUrl))
                        .replace('$1', StringUtils.escape(result || originalUrl)) +
                        `<a href='https://support.${supportDomain}/Links#faq' target='_blank' class='default-btn'>` +
                        $.localize.getString('Learn More…') +
                        '</a>',
                      true,
                    );
                  }
                }
              },
            );
          }
        }
      }
      function openLocalFileLink(text, anchorFragment) {
        text = text.replace(/^file:\/{0,2}/, '');
        if (FileHelper.isSupportedFile(text, true)) {
          if (/\.txt/.exec(text)) {
            JSBridge.invoke('shell.openItem', text);
          } else {
            JSBridge.invoke('app.openFileOrFolder', text, {
              forceCreateWindow: false,
              mountFolder: File.getMountFolder(),
              anchor: anchorFragment || '',
            });
          }
        } else {
          var extension = reqnode('path').extname(text);
          if (
            /\.(app|bat|bin|cmd|sh|command|csh|exe|gadget|inf|inx|ins|isu|jse|link|msi|msc|ksh|out|prg|reg|res|run|scp|vb.*|ws|wsf|wsh|ahk|jar|py|js)$/i.exec(
              extension,
            )
          ) {
            JSBridge.showInFinder(text.replace(/^file:\/{0,2}/, ''));
          } else {
            JSBridge.invoke('shell.openItem', text);
          }
        }
      }
      function openExternalLink() {
        if (File.isNode) {
          if (/^file:/.exec(inputText)) {
            openLocalFileLink(inputText);
          } else {
            if (/^https?:/.exec(inputText)) {
              JSBridge.showInBrowser(inputText);
            } else {
              try {
                JSBridge.showInBrowser(originalUrl);
              } catch (error) {
                console.warn(error);
              }
            }
          }
        } else {
          if (File.isMac) {
            bridge.callHandler(
              'path.openURL',
              /^https?:/.exec(originalUrl) ? originalUrl : inputText,
            );
          } else {
            window.open(encodeURI(inputText));
          }
        }
      }
    }
    _bindMouseEvents() {
      var receiver = this,
        mouseMoved = false,
        editableWidgetSelector = '.footnotes, [mdtype="table"], .md-task-list-item, .md-image';
      window.addEventListener('mouseup', function (pointerEvent) {
        if (receiver.isMousePressed && 1 === pointerEvent.which) {
          receiver.brush.expandOnDelay();
        }
        receiver.isMousePressed = false;
      });
      $(this.sessionStr)
        .on('mouseenter', '.md-htmlblock-container', function (pointerEvent) {
          if (1 == pointerEvent.which && File.isNodeHtml) {
            var range = receiver.selection.getRangy();
            if (
              !(
                !range ||
                this == range.commonAncestorContainer ||
                this.contains(range.commonAncestorContainer) ||
                range.commonAncestorContainer.contains(this) ||
                this.parentElement.classList.contains('md-rawblock-on-edit')
              )
            ) {
              if (
                -1 == range.comparePoint(this.parentElement, this.parentElement.childNodes.length)
              ) {
                this.parentElement.setAttribute('contenteditable', 'true');
                range.setStartBefore(this);
                range.select();
              }
            }
          }
        })
        .on('mouseenter', "[md-inline='reflink']", function () {
          var element = this.querySelector('a'),
            ref = element.dataset.ref,
            documentNode = receiver.nodeMap.link_list.getNodeByRef(ref),
            attributeValue = (documentNode && documentNode.get('title')) || '';
          element.setAttribute('title', attributeValue);
        })
        .on('mouseenter mouseover mouseleave', editableWidgetSelector, function (pointerEvent) {
          if (1 == pointerEvent.which) {
            $(this).attr('contenteditable', true);
          }
        })
        .on('mouseover mouseleave', '.td-span', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            $(this).closest('[mdtype="table"]').attr('contenteditable', 'true');
          }
        })
        .on('mousedown', function (keyboardEvent) {
          mouseMoved = false;
          receiver.selection.clearGlobalColumn();
          var currentElement,
            classList = document.body.classList;
          if (
            classList.contains('marklyra-show-word-count') ||
            classList.contains('marklyra-show-spell-check')
          ) {
            classList.remove('marklyra-show-word-count');
            classList.remove('marklyra-show-spell-check');
          }
          if (
            File.isNode &&
            classList.contains('marklyra-fullscreen') &&
            classList.contains('native-window')
          ) {
            JSBridge.invoke('window.setMenuBarVisibility', false);
          }
          if ('UL' == keyboardEvent.target.tagName) {
            if (
              (currentElement = receiver.getMarkElem(keyboardEvent.target)).attr('mdtype') ==
              TYPE.list
            ) {
              var offset = currentElement.find('li').offset(),
                range = offset
                  ? document.caretRangeFromPoint(offset.left + 1, keyboardEvent.clientY)
                  : null;
              setTimeout(function () {
                receiver.selection.setRange(range);
              }, 10);
              currentElement = range ? $(range.startContainer).closest('[cid]') : null;
            } else {
              currentElement = null;
            }
          }
          var domNode = keyboardEvent.target.closest('.md-alert-text-container');
          if (domNode) {
            let currentRange = receiver.selection.rangy.createRange();
            currentRange.setEnd(domNode.nextElementSibling, 0);
            currentRange.setStart(domNode.nextElementSibling, 0);
            domNode.parentElement.classList.add('md-expand');
            receiver.selection.deRange(currentRange, true);
          }
          if (File.inBusyMode || currentElement) {
            currentElement = currentElement || receiver.getMarkElem(keyboardEvent.target);
            if (!(!keyboardEvent.shiftKey && currentElement.length)) {
              if (!currentElement.hasClass('md-focus') && currentElement.length) {
                document.querySelectorAll('.md-focus').forEach(function (element) {
                  element.classList.remove('md-focus');
                });
                setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true');
              }
            }
            var nodeType = currentElement.attr('mdtype');
            if (
              !(
                !currentElement.length ||
                Node.canContainBlock(nodeType, true) ||
                Node.isType(
                  nodeType,
                  TYPE.fences,
                  TYPE.hr,
                  TYPE.def_link,
                  TYPE.def_footnote,
                  TYPE.math_block,
                )
              )
            ) {
              if (!currentElement.hasClass('md-focus')) {
                currentElement.addClass('md-focus');
              }
              setAttributeOnlyNeeded(currentElement[0], 'contenteditable', 'true');
            }
          }
          var localElement = $(keyboardEvent.target);
          if (Node.isType(localElement.attr('mdtype'), TYPE.paragraph, TYPE.heading)) {
            localElement.find('.math-jax-postprocess>.md-math-after-sym').last().text('​');
          }
          $('.dropdown-menu.open:not(#marklyra-sidebar), .dropdown-menu.show')
            .removeClass('open')
            .removeClass('show')
            .find('.active')
            .removeClass('active');
          $('.marklyra-tooltip').removeClass('shown');
          $(editableWidgetSelector)
            .filter(function () {
              return (
                (this == keyboardEvent.target || this.contains(keyboardEvent.target)) &&
                'true' !== this.getAttribute('contenteditable')
              );
            })
            .attr('contenteditable', 'true');
          if (localElement.hasClass('md-def-footnote')) {
            setTimeout(function () {
              var selection = window.getSelection();
              if (selection) {
                var element = $(selection.focusNode).closest('.md-reverse-footnote-area');
                if (element.length) {
                  if ((selectionRange = receiver.selection.getRangy()).isBackward) {
                    selectionRange.setStart(element[0].previousSibling, 1);
                  } else {
                    selectionRange.setEnd(element[0].previousSibling, 1);
                  }
                  if (selection.anchorNode == self.focusNode) {
                    selectionRange.collapse();
                  }
                  receiver.selection.deRange(selectionRange, true);
                } else {
                  if (
                    selection &&
                    selection.isCollapsed &&
                    selection.anchorOffset == selection.anchorNode.length
                  ) {
                    var selectionRange = receiver.selection.getRangy();
                    receiver.selection.deRange(selectionRange, true);
                  }
                }
              }
            }, 0);
          } else {
            if (
              localElement.closest('a').length &&
              !localElement.closest('img').length &&
              (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
            ) {
              keyboardEvent.stopPropagation();
              keyboardEvent.preventDefault();
              return false;
            }
            localElement.closest('.md-fences:not(.CodeMirror)').length;
          }
          receiver.lastCursor = receiver.selection.buildUndo();
          receiver.isMousePressed = 1 === keyboardEvent.which;
        })
        .on('click', "[md-inline='link']>.md-content, .md-def-url", function (keyboardEvent) {
          if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
            JSBridge.putSetting('noHintForOpenLink', true);
            receiver.tryOpenUrl($(this).text());
            return false;
          }
          EditHelper.showHintOrWarning({
            key: 'noHintForOpenLink',
            title: $.localize.getString(
              File.isMac
                ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
              'Front',
            ),
            checked: true,
          });
          keyboardEvent.preventDefault();
        })
        .on('mousemove', function (pointerEvent) {
          mouseMoved = true;
          if (1 == pointerEvent.which && File.inBusyMode) {
            receiver.selection.handleMouseSelection(pointerEvent);
          }
        })
        .on('mousedown', 'mjx-container a', function (keyboardEvent) {
          if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
            JSBridge.putSetting('noHintForOpenLink', true);
            receiver.tryOpenLink($(keyboardEvent.target).closest('a'));
            return false;
          } else {
            EditHelper.showHintOrWarning({
              key: 'noHintForOpenLink',
              title: $.localize.getString(
                File.isMac
                  ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                  : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                'Front',
              ),
              checked: true,
            });
            return false;
          }
        })
        .on('mousedown', function (event) {
          if (3 == (event.originalEvent || event).detail) {
            receiver.selection.fixTripleClick(event);
            return void event.preventDefault();
          }
        })
        .on('click', function (keyboardEvent) {
          if (3 != (keyboardEvent.originalEvent || keyboardEvent).detail) {
            var selectionTop,
              targetElement = receiver.getMarkElem(keyboardEvent.target);
            receiver.library.outline.autoHideOutline();
            if (receiver.autoComplete.isShown()) {
              receiver.brush.triggerAutoComplete();
            }
            if (receiver.searchPanel.isOpen()) {
              let selectionRange = receiver.selection.getRangy();
              selectionTop = selectionRange
                ? selectionRange.nativeRange.getBoundingClientRect().top
                : null;
              receiver.searchPanel.closePanel(true);
            }
            if (
              'INPUT' !== keyboardEvent.target.tagName ||
              'checkbox' !== keyboardEvent.target.getAttribute('type')
            ) {
              if (
                isInputComponent(keyboardEvent.target) ||
                (keyboardEvent.target.classList &&
                  keyboardEvent.target.classList.contains('code-tooltip'))
              ) {
                keyboardEvent.preventDefault();
                return void $(keyboardEvent.target).trigger('focus');
              }
              if (
                targetElement.hasClass('md-fences') &&
                receiver.fences.clickEventHandled.call(
                  receiver.fences,
                  keyboardEvent,
                  targetElement.attr('cid'),
                )
              ) {
                return false;
              }
              var element = $(keyboardEvent.target).closest('a, area, .md-footnote');
              if (element.length) {
                keyboardEvent.stopPropagation();
                keyboardEvent.preventDefault();
                if (element.closest('.md-toc').length) {
                  return;
                }
                var openLinkModifier = File.isMacOrMacNode
                  ? keyboardEvent.metaKey
                  : keyboardEvent.ctrlKey;
                if (
                  openLinkModifier ||
                  element.closest('.md-htmlblock-container, .md-reverse-footnote-area').length
                ) {
                  receiver.tryOpenLink(element);
                  if (openLinkModifier) {
                    JSBridge.putSetting('noHintForOpenLink', true);
                  }
                  return false;
                }
                var currentElement = $(keyboardEvent.target).closest('.md-image'),
                  localElement = currentElement.closest('[md-inline="link"]');
                (localElement.length ? localElement : currentElement).addClass('md-expand');
                EditHelper.showHintOrWarning({
                  key: 'noHintForOpenLink',
                  title: $.localize.getString(
                    File.isMac
                      ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                      : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                    'Front',
                  ),
                  checked: true,
                });
                keyboardEvent.preventDefault();
              }
              var targetNode = receiver.findNodeByElem(targetElement);
              if (Node.isType(targetNode, NodeDef.TYPE.paragraph, NodeDef.TYPE.heading)) {
                $('.md-tooltip-remove').remove();
              }
              var range = receiver.selection.getRangy();
              if (range && selectionTop) {
                var scrollContainer = document.querySelector('content'),
                  top = range.nativeRange.getBoundingClientRect().top;
                if (top) {
                  scrollContainer.scrollTop = scrollContainer.scrollTop + (top - selectionTop);
                }
              }
              if (
                range &&
                range.commonAncestorContainer == receiver.writingArea &&
                !range.collapsed
              ) {
                keyboardEvent.stopPropagation();
                return false;
              } else {
                return void 0;
              }
            }
          }
        })
        .on('dblclick', function (doubleClickEvent) {
          receiver.selection.fixDblClick(doubleClickEvent);
          receiver.brush.expand(void 0, void 0, true, true);
        })
        .on('mouseup', function (pointerEvent) {
          Object.defineProperty(refocusTargetNode, 'name', { value: 'm', configurable: true });

          receiver.isMousePressed = false;
          receiver.isIME = false;
          if (
            !File.isLocked &&
            !isInputComponent(document.activeElement) &&
            !isInputComponent(pointerEvent.target)
          ) {
            $(editableWidgetSelector + ', .md-rawblock')
              .filter(function () {
                return (
                  !(this == pointerEvent.target || this.contains(pointerEvent.target)) &&
                  'false' != this.getAttribute('contenteditable')
                );
              })
              .attr('contenteditable', 'false');
            var range = receiver.selection.getRangy();
            if (
              range &&
              !range.collapsed &&
              Node.isType(
                range.commonAncestorContainer.tagName,
                'LI',
                'UL',
                'QUOTEBLOCK',
                'ARTICLE',
              )
            ) {
              receiver.refocus(null);
            }
            var selectionContainer = range ? range.commonAncestorContainer : pointerEvent.target;
            if (
              (selectionContainer == receiver.writingArea ||
                receiver.writingArea.contains(selectionContainer)) &&
              !pointerEvent.button
            ) {
              var localElement = receiver.getMarkElem(pointerEvent.target),
                element = localElement[0],
                targetNodeId =
                  element && !element.querySelector('[cid]') ? element.getAttribute('cid') : void 0;
              if (localElement.closest('.md-fences:not(.CodeMirror)').length) {
                var scrollTop = $('content').scrollTop();
                receiver.fences.focus(element.getAttribute('cid'));
                if (!(range && range.collapsed)) {
                  $('content').scrollTop(scrollTop);
                }
              }
              if (
                !localElement.length &&
                pointerEvent.target == receiver.writingArea &&
                (!mouseMoved || !range || range.collapsed)
              ) {
                try {
                  var documentNode = receiver.nodeMap.getLast(),
                    nodeElement = receiver.findElemById(documentNode.cid);
                  if (pointerEvent.pageY - nodeElement.offset().top - nodeElement.height() > 0) {
                    if (
                      !Node.isType(documentNode, TYPE.paragraph, TYPE.heading) ||
                      documentNode.get('text').length
                    ) {
                      var placeholderCommand = UndoManager.makeEmptyCommand(
                          receiver.selection.buildUndo(),
                        ),
                        placeholderNode = receiver.selection.addUnholdable(
                          documentNode,
                          placeholderCommand,
                        ),
                        currentNodeElement = receiver.findElemById(placeholderNode.cid);
                      receiver.undo.register(placeholderCommand);
                      receiver.selection.jumpIntoElemBegin(currentNodeElement);
                      localElement = currentNodeElement;
                    } else {
                      receiver.selection.jumpIntoElemEnd(
                        receiver.findElemById(documentNode.getVeryFirst(true).cid),
                      );
                      localElement = nodeElement;
                    }
                    if (localElement.length && File.inBusyMode) {
                      setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'false');
                    }
                    receiver.refocus(localElement.attr('cid'));
                    pointerEvent.stopPropagation();
                  }
                } catch (error) {}
              }
              try {
                clearTimeout(clickTimer);
                if ('BODY' == document.activeElement.tagName) {
                  clicks = 0;
                  if (receiver.writingArea.contains(pointerEvent.target) && targetNodeId) {
                    refocusTargetNode();
                  }
                } else {
                  if (clicks < 2) {
                    clickTimer = setTimeout(
                      Object.defineProperty(
                        function waitForPointerRelease() {
                          if (receiver.isMousePressed) {
                            clickTimer = setTimeout(waitForPointerRelease, DBCLICK_DELAY);
                          } else {
                            clicks = 0;
                            refocusTargetNode();
                          }
                        },
                        'name',
                        { value: 't', configurable: true },
                      ),
                      DBCLICK_DELAY,
                    );
                    clicks++;
                  } else {
                    clicks = 0;
                    refocusTargetNode();
                  }
                }
                (function () {
                  receiver.undo.endSnap(true);
                  var currentElement = receiver.writingArea.querySelector('.unholdable');
                  if (currentElement && currentElement.getAttribute('cid') != receiver.focusCid) {
                    if (currentElement.textContent.length) {
                      currentElement.classList.remove('unholdable');
                    } else {
                      var selection = window.getSelection();
                      if (
                        !selection ||
                        (selection.anchorNode != currentElement &&
                          selection.extentNode != currentElement)
                      ) {
                        var removeCommand = UndoManager.makeEmptyCommand(
                            receiver.selection.buildUndo(),
                          ),
                          currentDocumentNode = receiver.getNode(
                            currentElement.getAttribute('cid'),
                          );
                        receiver.undo.UndoManager.addUndoForRemove(
                          removeCommand,
                          currentDocumentNode,
                        );
                        removeCommand.redo.push(receiver.selection.buildUndo());
                        currentDocumentNode.remove();
                        currentElement.remove();
                        receiver.undo.register(removeCommand);
                      } else {
                        currentElement.classList.remove('unholdable');
                      }
                    }
                  }
                })();
              } catch (currentError) {
                console.warn(currentError.stack);
              }
              if (!(File.isLocked || File._onInitParse)) {
                if (File.inBusyMode) {
                  if (range && range.collapsed) {
                    setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'false');
                  }
                } else {
                  setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true');
                }
              }
            }
          }
          function refocusTargetNode() {
            if (File.isTypeWriterMode && File.option.scrollWithCursor) {
              receiver.selection.typeWriterScroll(null, null, function () {
                receiver.refocus(targetNodeId);
              });
            } else {
              receiver.refocus(targetNodeId);
            }
          }
        });
      var currentWritingArea = document.querySelector('#write');
      $(document)
        .on('mouseup', function (pointerEvent) {
          if (
            !(
              isInputComponent(pointerEvent.target) ||
              'SELECT' == pointerEvent.target.tagName ||
              isInputComponent(document.activeElement)
            )
          ) {
            if (!currentWritingArea.contains(pointerEvent.target)) {
              if (window.getSelection().toString().length) {
                clicks = 0;
              }
              if (!(File.isLocked || File.inBusyMode)) {
                setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true');
              }
              fastdom.mutate(function () {
                $('.md-tooltip-hide').hide();
              });
            }
            if (!$(pointerEvent.target).closest('.context-menu').length) {
              if (receiver.contextMenu) {
                receiver.contextMenu.hide();
              }
            }
          }
        })
        .on('mousedown', 'svg a', function (keyboardEvent) {
          var linkHref = this.getAttribute('href') || '';
          if (/^(%20|\s)*(javascript|data)/im.exec(linkHref)) {
            this.setAttribute('href', '');
          }
          if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
            if (!$(keyboardEvent.target).closest('.md-diagram').length) {
              receiver.tryOpenLink($(keyboardEvent.target).closest('a'));
              JSBridge.putSetting('noHintForOpenLink', true);
            }
            return false;
          } else {
            EditHelper.showHintOrWarning({
              key: 'noHintForOpenLink',
              title: $.localize.getString(
                File.isMac
                  ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                  : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                'Front',
              ),
              checked: true,
            });
            return false;
          }
        })
        .on('click', '.md-f-tooltip', function (dragEvent) {
          var element = $(dragEvent.target).closest('a');
          if (element.length) {
            receiver.tryOpenLink(element);
            return false;
          }
        });
      var currentTarget,
        scheduleFocusModeExit = Object.defineProperty(
          function () {
            if (exitFocusModeTimer) {
              clearTimeout(exitFocusModeTimer);
            }
            exitFocusModeTimer = setTimeout(exitFocusMode.bind(receiver), 100);
          },
          'name',
          { value: 'o', configurable: true },
        ),
        scrollContainer = document.querySelector('content');
      scrollContainer.addEventListener(
        'wheel',
        function (wheelEvent) {
          if (!(Math.abs(wheelEvent.deltaY) < 4 || wheelEvent.target.closest('.dropdown-menu'))) {
            receiver.lazyFireEvent_(scrollContainer, 'post-wheel', File.inBusyMode ? 2e3 : 500);
          }
        },
        { passive: true },
      );
      setTimeout(() => {
        scrollContainer.addEventListener(
          'scroll',
          function (unusedParameter1) {
            if (receiver.isMousePressed && File.isFocusMode && File.isTypeWriterMode) {
              scheduleFocusModeExit();
            }
            receiver.lastScrolling = new Date().getTime();
            receiver.lazyFireEvent_(scrollContainer, 'post-scroll', File.inBusyMode ? 2e3 : 500);
          },
          { passive: true },
        );
      }, 1e3);
      scrollContainer.addEventListener('mousedown', function (scrollEvent) {
        currentTarget = scrollEvent.target;
      });
      scrollContainer.addEventListener('click', function (pointerEvent) {
        if (receiver.library && receiver.library.fileSearch) {
          receiver.library.fileSearch.clearContentHighlight();
        }
        if (pointerEvent.target == scrollContainer || pointerEvent.target == receiver.writingArea) {
          if (currentTarget == pointerEvent.target) {
            receiver.forceClick(pointerEvent);
          }
        } else {
          if (
            pointerEvent.target.hasAttribute &&
            pointerEvent.target.getAttribute('mdtype') == TYPE.paragraph
          ) {
            if (currentTarget !== pointerEvent.target) {
              return void (currentTarget = null);
            }
            var range = receiver.selection.getRangy();
            if (!range) {
              return;
            }
            var target = pointerEvent.target,
              commonAncestorContainer = range.commonAncestorContainer;
            if (
              (commonAncestorContainer &&
                commonAncestorContainer.classList &&
                commonAncestorContainer.classList.contains('MathJax_SVG')) ||
              (target != range.startContainer &&
                target != range.endContainer &&
                !target.contains(range.startContainer) &&
                !target.contains(range.endContainer))
            ) {
              if (!target || !target.lastElementChild) {
                return;
              }
              if (pointerEvent.clientX > target.lastElementChild.getBoundingClientRect().right) {
                receiver.selection.jumpIntoElemEnd($(target));
              }
            }
          }
        }
        currentTarget = null;
      });
      $(scrollContainer)
        .on('post-scroll', function () {
          $('.auto-suggest-container.marklyra-show').removeClass('marklyra-show');
          if (receiver.autoComplete) {
            receiver.autoComplete.postScroll();
          }
        })
        .on('post-wheel', function () {
          if (File.isFocusMode && File.isTypeWriterMode) {
            scheduleFocusModeExit();
          }
        });
    }
    isScrolling() {
      if (!File.option.initAnchor && this.lastScrolling) {
        if (new Date().getTime() - this.lastScrolling < 60) {
          return true;
        }
        this.lastScrolling = 0;
      }
      return false;
    }
    forceClick(pointerEvent) {
      Object.defineProperty(moveCursorToElementEdge, 'name', { value: 't', configurable: true });

      function moveCursorToElementEdge(targetElement, moveToEnd) {
        if (moveToEnd) {
          receiver.selection.jumpIntoElemEnd(targetElement);
        } else {
          receiver.selection.jumpIntoElemBegin(targetElement);
        }
        pointerEvent.preventDefault();
        pointerEvent.stopPropagation();
      }
      console.debug('forceClick', pointerEvent);
      var receiver = this,
        range = receiver.selection.getRangy();
      if (range && range.startContainer) {
        if (receiver.writingArea.contains(range.commonAncestorContainer)) {
          return;
        }
        if ($(range.startContainer.parentElement).offset().top > pointerEvent.clientY - 30) {
          return;
        }
      }
      File.isLocked;
      for (
        var hitElement,
          element,
          innerHeight = window.innerHeight,
          bounds = document.querySelector('#write > *').getBoundingClientRect(),
          nearRightEdge = pointerEvent.pageX > bounds.right - 2,
          nearLeftEdge = pointerEvent.pageX < bounds.left + 2,
          centerX = (bounds.left + bounds.right) / 2,
          pageY = pointerEvent.pageY;
        pageY < innerHeight;
        pageY += 20
      ) {
        element = (hitElement = $(document.elementFromPoint(centerX, pageY)))
          .closest('[mdtype]')
          .addBack('[mdtype]');
        if (!hitElement.find('[mdtype]').length && element.length) {
          moveCursorToElementEdge(element, nearRightEdge);
          receiver.refocus(element.attr('cid'));
          return void (File.inBusyMode && element.focus());
        }
      }
      for (pageY = pointerEvent.pageY; pageY > 0; pageY -= 20) {
        element = (hitElement = $(document.elementFromPoint(centerX, pageY)))
          .closest('[mdtype]')
          .addBack('[mdtype]');
        if (!hitElement.find('[mdtype]').length && element.length) {
          moveCursorToElementEdge(element, !nearLeftEdge);
          receiver.refocus(element.attr('cid'));
          return void (File.inBusyMode && element.focus());
        }
      }
    }
    lazyFireEvent_(eventTarget, eventType, delayMs) {
      var timerPool_ = this.timerPool_,
        timerId = this.timerPool_[eventType];
      delayMs = delayMs || 100;
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(function () {
        $(eventTarget).trigger(eventType);
        timerPool_[eventType] = null;
      }, 100);
    }
    onDropContent(domContent, selectionRange) {
      if (!File.isMac || !File.isActiveWindow()) {
        dropContents = null;
        return false;
      }
      if (selectionRange) {
        this.selection.setRange(selectionRange);
      }
      UserOp.insertDom(domContent);
    }
    simpleParse(documentNode, enableStartMatch) {
      var wasParagraph = Node.isType(documentNode, TYPE.paragraph);
      if (
        Node.isType(documentNode, TYPE.raw_edit, TYPE.paragraph) &&
        /(^[<\u2013\u2014`~>#|\-+*1-9=\[])|\n\s*\S/gm.test(documentNode.safeGetStrAttr('text'))
      ) {
        this.brush.pause();
        var parseResult,
          replacementHtml,
          parseCommand = this.undo.UndoManager.makeEmptyCommand();
        parseCommand.undo.push(this.selection.buildUndo());
        parseCommand.undo.push(UndoManager.buildReplaceUndo(documentNode));
        parseResult = documentNode.parseFrom(
          enableStartMatch
            ? { skips: { enableStartMatch: true, enableRemap: true } }
            : { skips: { enableRemap: true } },
        );
        if (
          wasParagraph &&
          Node.isType(documentNode, TYPE.paragraph) &&
          1 == parseResult[1].length
        ) {
          this.brush.restart();
          return null;
        } else {
          parseCommand.redo.push(this.undo.buildReplaceUndo(parseResult[1][0]));
          UndoManager.addUndoForInsertArray(parseCommand, parseResult[1].slice(1));
          replacementHtml = parseResult[0];
          this.brush.restart();
          return [parseCommand, replacementHtml, documentNode.cid, parseResult[1]];
        }
      }
    }
    findElemById(nodeId) {
      if (nodeId) {
        return $(this.writingArea.querySelector('[cid="' + nodeId + '"]'));
      } else {
        return $();
      }
    }
    findNodeByElem(element) {
      if (element.length) {
        return this.getNode(element.attr('cid'), false);
      } else {
        return null;
      }
    }
    insertText(plainText) {
      this.UserOp.pasteHandler(this, plainText, true, true, true);
    }
    finishRawBlockEdit(inputEvent) {
      var element = null,
        nodeType = (element = inputEvent
          ? $(inputEvent.target).closest('.md-rawblock')
          : $(document.activeElement).closest('.md-rawblock')).attr('mdtype');
      if (nodeType == TYPE.html_block) {
        this.htmlBlock.stopEditing(element.attr('cid'), true);
      }
      if (nodeType == TYPE.math_block) {
        this.mathBlock.stopEditing(element.attr('cid'), true);
      }
      $('.marklyra-tooltip').removeClass('shown');
    }
    warpContentWithOption(text) {
      if (File.finalNewline && '\n' != text.substr(text.length - 1)) {
        return text + (File.useCRLF ? '\r\n' : '\n');
      } else {
        return text;
      }
    }
    getMarkdown() {
      if (this.sourceView.inSourceMode) {
        return this.sourceView.cm.getValue();
      } else {
        return this.warpContentWithOption(this.nodeMap.toMark());
      }
    }
    getNode(nodeId, resolveFocusedNode, forceRefocus) {
      if (forceRefocus) {
        nodeId = this.refocus();
      } else {
        if (resolveFocusedNode && !(nodeId = nodeId || this.focusCid)) {
          nodeId = this.refocus();
        }
      }
      return this.nodeMap.allNodes.get(nodeId);
    }
    restoreLastCursor(event, suppressExtraCommands) {
      if (event) {
        event.preventDefault();
      }
      if (this.lastCursor) {
        if (document.activeElement != this.writingArea) {
          var scrollTop = $('content').scrollTop();
          this.writingArea.focus();
          $('content').scrollTop(scrollTop);
        }
        this.undo.exeCommand(this.lastCursor, suppressExtraCommands ? [] : void 0);
      }
    }
    toggleFocusMode() {
      File.isFocusMode = !File.isFocusMode;
      JSBridge.putSetting('isFocusMode', File.isFocusMode);
      this.updateFocusMode(File.isFocusMode, true, true);
      if (!File.isFocusMode) {
        document.body.classList.remove('marklyra-show-notification');
      }
    }
    updateFocusMode(enabled, updateMenu, showWarning) {
      if (enabled) {
        enterFocusMode.call(this);
      } else {
        exitFocusMode.call(this);
      }
      if (updateMenu) {
        if (File.isNode) {
          window.ClientCommand.refreshViewMenu();
        } else {
          if (File.isMac) {
            JSBridge.menu.update('View→Focus Mode', { state: File.isFocusMode });
          }
        }
      }
      if (enabled && showWarning) {
        EditHelper.showFocusModeWarning();
      }
    }
    setTypeWriterMode(isTypeWriterMode, forceUpdate, showWarning) {
      if (File.isTypeWriterMode != isTypeWriterMode || forceUpdate) {
        File.isTypeWriterMode = isTypeWriterMode;
        var receiver = this;
        if (isTypeWriterMode) {
          if (!document.body.classList.contains('marklyra-on-typewriter-mode')) {
            document.body.classList.add('marklyra-on-typewriter-mode');
          }
          setTimeout(function () {
            var verticalPadding =
              (document.querySelector('content').clientHeight - receiver.defaultTextHeight) / 2;
            document.querySelector('#write-style').innerHTML =
              '#write { \npadding-top: $1px;\npadding-bottom: 0;\n}\n#write:after {\nheight: $2px;\n}'
                .replace(/\$1/g, verticalPadding - receiver.defaultTextHeight)
                .replace(/\$2/g, verticalPadding + receiver.defaultTextHeight);
            if (!(receiver.sourceView && receiver.sourceView.inSourceMode)) {
              receiver.selection.typeWriterScroll(null, null);
            }
          }, 100);
        } else {
          if (!forceUpdate) {
            document.querySelector('#write-style').innerHTML = 0;
            document.body.classList.remove('marklyra-on-typewriter-mode');
            receiver.selection.scrollAdjust();
          }
        }
        if (receiver.sourceView) {
          receiver.sourceView.enableTypeWriterMode(isTypeWriterMode);
        }
        if (!forceUpdate) {
          if (File.isNode) {
            window.ClientCommand.refreshViewMenu();
          } else {
            if (File.isMac) {
              JSBridge.menu.update('View→Typewriter Mode', { state: File.isTypeWriterMode });
            }
          }
        }
      }
      if (isTypeWriterMode && showWarning) {
        EditHelper.showTypeWriterModeWarning();
      }
    }
    toggleTypeWriterMode(enabled) {
      if (void 0 === enabled) {
        enabled = !File.isTypeWriterMode;
      }
      this.setTypeWriterMode(enabled, false, true);
      JSBridge.putSetting('isTypeWriterMode', enabled);
      if (!enabled) {
        document.body.classList.remove('marklyra-show-notification');
      }
    }
    syncFullContent() {
      var inSourceMode = File.editor.sourceView.inSourceMode || false;
      if (File.isMac) {
        if (File.isActiveWindow()) {
          var fullContent = File.sync();
          bridge.callHandler('controller.syncFullContent', [!!inSourceMode, fullContent]);
        }
      } else {
        if (File.isNode && File.isActiveWindow()) {
          JSBridge.invoke('document.syncFullContent', inSourceMode);
        }
      }
    }
    async applyFullContent(fromSourceMode, contentText) {
      if (!File.isActiveWindow()) {
        console.debug('applyFullContent');
        var content = contentText;
        if (File.isNode) {
          content = await JSBridge.invoke('document.getContent');
        }
        if (void 0 === content) {
          return;
        }
        this.undo.exeCommand(
          { type: 'sync', content: content, fromSourceMode: fromSourceMode },
          void 0,
          true,
        );
        this.refresh();
      }
    }
    syncChange(changes) {
      Object.defineProperty(filterFenceSnapshots, 'name', { value: 't', configurable: true });

      function filterFenceSnapshots(items, editorInstance) {
        return items.map(function (item) {
          if (item) {
            if ('fences' == item.type) {
              return null;
            } else {
              return item;
            }
          } else {
            return null;
          }
        }, editorInstance);
      }
      if (changes) {
        if (File.isMac) {
          bridge.callHandler(
            'document.syncChangeIfNeeded',
            JSON.stringify(filterFenceSnapshots(changes, this)),
            function (requiresFullSync) {
              if (requiresFullSync) {
                scheduleFullContentSync();
              }
            },
          );
        } else {
          if (File.isNode) {
            var ipcRenderer = reqnode('electron').ipcRenderer,
              syncCommands = filterFenceSnapshots(changes, this) || [];
            if (syncCommands.length) {
              ipcRenderer.send('doc.syncChange', JSON.stringify(syncCommands));
            }
          }
        }
      }
    }
    applyChange(changePayload) {
      try {
        if (!changePayload || File.isActiveWindow()) {
          return;
        }
        var items = 'string' == typeof changePayload ? JSON.parse(changePayload) : changePayload,
          requiresRefresh = false;
        if (window.debugMode) {
          console.debug(
            (firstCommand = items[0])
              ? 'sync' != firstCommand.type
                ? firstCommand.type
                : void 0 !== firstCommand.html
                  ? 'html'
                  : void 0 !== firstCommand.allHtml
                    ? 'allHtml'
                    : void 0 !== firstCommand.cmChanges
                      ? 'cmChanges'
                      : void 0 !== firstCommand.tex
                        ? 'tex'
                        : void 0 !== firstCommand.srcChanges
                          ? 'srcChanges'
                          : void 0 !== firstCommand.content
                            ? 'content'
                            : void 0
              : 'empty',
          );
        }
        items.forEach(function (item) {
          requiresRefresh = this.undo.exeCommand(item, void 0, true) || requiresRefresh;
        }, this);
        if (requiresRefresh) {
          this.refresh();
        }
      } catch (error) {
        console.error(error);
      }
      var firstCommand;
    }
    startScrolling(scrollUp) {
      this.strollingBySelect = true;
      var scrollContainer = $('content'),
        maxScrollTop = scrollContainer[0].scrollHeight - window.innerHeight,
        scrollTop = scrollUp ? 0 : maxScrollTop;
      scrollContainer
        .stop(true)
        .animate(
          { scrollTop: scrollTop },
          (Math.abs(scrollTop - scrollContainer.scrollTop()) / 256) * 1e3,
          'linear',
        );
    }
    stopScrolling() {
      if (this.strollingBySelect) {
        $('content').stop(true);
        this.strollingBySelect = false;
      }
    }
  }
  var syncTimer,
    doSync = function () {
      editor.syncFullContent();
      syncTimer = null;
    },
    scheduleFullContentSync = function () {
      if (syncTimer) {
        clearTimeout(syncTimer);
      }
      syncTimer = setTimeout(doSync, 500);
    };
  if (window.reqnode) {
    var ipc = reqnode('electron').ipcRenderer;
    ipc.on('scheduleFullContentSync', function () {
      scheduleFullContentSync();
    });
  }
  Editor.prototype.scheduleFullContentSync = scheduleFullContentSync;
  var pressReturn = function (keepContainer, softBreak, restoreOriginalCursor) {
      var breakResult,
        editCommand,
        selectionCommand,
        receiver = this;
      if (this.autoComplete) {
        this.autoComplete.hide();
      }
      this.undo.endSnap(true);
      var element = this.getMarkElem();
      this.brush.brushNode(element.attr('cid'));
      var range = this.selection.getRangy(),
        currentStartContainer = (range || {}).startContainer;
      if (currentStartContainer) {
        element = this.getMarkElem(currentStartContainer);
        if (Node.isType(element.attr('mdtype'), NodeDef.TYPE.fences, NodeDef.TYPE.footnote)) {
          return true;
        }
        this.brush.pause();
        if (
          receiver.getJQueryElem(range.commonAncestorContainer).closest("[mdlike='fences']").length
        ) {
          editCommand = selectionCommand = UndoManager.makeEmptyCommand(
            receiver.selection.buildUndo(range),
          );
          receiver.selection.jumpIntoElemEnd(element);
        } else {
          editCommand = selectionCommand = UserOp.backspaceHandler(
            this,
            null,
            'delSelection',
            true,
            false,
          );
          element = this.getMarkElem();
        }
        var elementLength = element.closest('.md-table').length,
          currentElementLength = elementLength,
          nodeId = element.attr('cid'),
          focusedNode = this.store(nodeId),
          selectionSnapshot = this.selection.buildUndo();
        if (File.isTypeWriterMode) {
          this.selection.lockNativeScroll();
        }
        if (
          (function (editorInstance) {
            if (element.attr('mdtype') == NodeDef.TYPE.meta_block) {
              try {
                var currentRange = editorInstance.selection.getRangy();
                return !(
                  !keepContainer &&
                  !softBreak &&
                  currentRange.collapsed &&
                  currentRange.endContainer.textContent.replace(/\n$/, '').length <=
                    currentRange.endOffset &&
                  currentRange.endContainer.textContent.match(/\n{2,}$/g)
                );
              } catch (error) {
                return true;
              }
            }
            return false;
          })(this)
        ) {
          (editCommand = editCommand || UndoManager.makeEmptyCommand()).undo.push(
            selectionSnapshot,
          );
          UserOp.insertInlineText(
            this,
            null,
            '\n',
            this.selection.getOffset(element),
            editCommand,
            true,
          );
          this.undo.register(editCommand);
          this.brush.addToQueue(nodeId);
        } else {
          if (
            (function (editorInstance) {
              var currentDocumentNode = editorInstance.getNode(nodeId);
              if (
                Node.isType(currentDocumentNode, TYPE.def_link, TYPE.def_footnote) &&
                Node.isEmptyBlock(currentDocumentNode)
              ) {
                return true;
              }
            })(this)
          ) {
            editCommand = this.UserOp.backToParagraph(receiver, this.getNode(nodeId), true, false);
            if (selectionCommand) {
              editCommand = UndoManager.append(selectionCommand, editCommand);
            }
            this.undo.register(editCommand);
          } else {
            if (elementLength) {
              if (softBreak) {
                this.UserOp.pasteHandler(this, '<br />', true);
              } else {
                if (keepContainer) {
                  editCommand = this.tableEdit.addRow(false, selectionCommand);
                  if (selectionCommand) {
                    editCommand = UndoManager.append(selectionCommand, editCommand);
                    this.undo.register(editCommand);
                  }
                } else {
                  for (; selectionCommand && selectionCommand.undo.length; ) {
                    this.undo.exeCommand(selectionCommand.undo.pop());
                  }
                  this.tableEdit.moveToBelowCell(true);
                }
              }
            } else {
              if (
                !currentElementLength &&
                focusedNode &&
                (breakResult = focusedNode.breakOn(keepContainer, this, softBreak))
              ) {
                var scrollTop = document.querySelector('content').scrollTop,
                  nodeElement = this.findElemById(breakResult.oldCid),
                  replacementNodes = $.parseHTML(breakResult.newHtml);
                if (replacementNodes.length) {
                  nodeElement.replaceWith(replacementNodes);
                  replacementNodes;
                } else {
                  nodeElement.remove();
                }
                var documentNode = this.getNode(breakResult.nextFocus);
                if (restoreOriginalCursor) {
                  this.undo.exeCommand(selectionSnapshot);
                  breakResult.command.redo.push(selectionSnapshot);
                } else {
                  if (Node.isType(documentNode, TYPE.math_block)) {
                    breakResult.command.redo.push({
                      type: 'fences-pos',
                      id: breakResult.nextFocus,
                      pos: { line: 0, ch: 0 },
                    });
                    breakResult.nextFocus;
                    setTimeout(function () {
                      receiver.mathBlock.startEditing(breakResult.nextFocus, 'begin');
                    }, 0);
                  } else {
                    if (Node.isType(documentNode, TYPE.html_block)) {
                      breakResult.command.redo.push({
                        type: 'fences-pos',
                        id: breakResult.nextFocus,
                        pos: { line: 0, ch: 0 },
                      });
                      setTimeout(function () {
                        receiver.htmlBlock.startEditing(breakResult.nextFocus, 'auto');
                      }, 0);
                    } else {
                      var currentNodeElement = this.findElemById(breakResult.nextFocus);
                      if (breakResult.cursor) {
                        if (softBreak) {
                          currentNodeElement.find('.md-emoji-control-ch').text('');
                        }
                        this.undo.exeCommand(breakResult.cursor);
                        if (softBreak) {
                          currentNodeElement.find('.md-emoji-control-ch').text('​');
                        }
                      } else {
                        if (breakResult.cursorDiff) {
                          this.selection.jumpInto(currentNodeElement, breakResult.cursorDiff);
                        } else {
                          this.selection.jumpIntoElemBegin(currentNodeElement);
                        }
                      }
                      breakResult.command.redo.push(this.selection.buildUndo());
                    }
                  }
                  this.focusCid = this.refocus(breakResult.nextFocus, void 0, void 0, true);
                  this.findElemById(breakResult.nextFocus).addClass('md-focus');
                  if (Node.isType(documentNode, TYPE.fences)) {
                    this.fences.lastCodeLang = documentNode.get('lang') || '';
                  }
                }
                if (selectionCommand) {
                  breakResult.command = UndoManager.append(selectionCommand, breakResult.command);
                }
                this.undo.register(breakResult.command);
                this.quickRefresh();
                document.querySelector('content').scrollTop = scrollTop;
              }
            }
          }
        }
        if (!breakResult || !breakResult.nextFocus) {
          this.refocus();
        }
        this.brush.resume();
        this.selection.scrollAdjust();
        return true;
      }
    },
    normalCleanTooltip_ = function () {
      $('.md-tooltip-remove').remove();
      $('.md-focus').removeClass('md-focus');
      $('.md-focus-container').removeClass('md-focus-container');
      var classList = document.body.classList;
      if (
        classList.contains('marklyra-show-word-count') ||
        classList.contains('marklyra-show-spell-check')
      ) {
        classList.remove('marklyra-show-word-count');
        classList.remove('marklyra-show-spell-check');
      }
    },
    viewInFocusMode = false,
    exitFocusModeTimer,
    enterFocusMode = function () {
      if (exitFocusModeTimer) {
        clearTimeout(exitFocusModeTimer);
      }
      if (!viewInFocusMode) {
        viewInFocusMode = true;
        document.body.classList.add('on-focus-mode');
        exitFocusModeTimer = setTimeout(enterFocusMode, 100);
      }
    },
    exitFocusMode = function () {
      if (exitFocusModeTimer) {
        clearTimeout(exitFocusModeTimer);
        exitFocusModeTimer = null;
      }
      if (viewInFocusMode) {
        viewInFocusMode = false;
        document.body.classList.remove('on-focus-mode');
      }
    };
  function performClick(keyboardEvent, targetElement, screenX, screenY) {
    var mouseEvent = document.createEvent('MouseEvents');
    mouseEvent.initMouseEvent(
      'mousedown',
      true,
      true,
      targetElement.ownerDocument.defaultView,
      1,
      keyboardEvent.screenX + screenX,
      keyboardEvent.screenY + screenY,
      keyboardEvent.clientX + screenX,
      keyboardEvent.clientY + screenY,
      keyboardEvent.ctrlKey,
      keyboardEvent.altKey,
      keyboardEvent.shiftKey,
      keyboardEvent.metaKey,
      keyboardEvent.button,
    );
    targetElement.dispatchEvent(mouseEvent);
  }
  module.exports = Editor;
}
