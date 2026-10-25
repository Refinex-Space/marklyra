// editor-controller.
// SystemJS module 5f. Dependencies: 2c, e, 11, 13, 19, 12, 14, 1a, 18, 1c, 28, 2b, 26, 32, 29, 17, 58, 2f, 1b, 27, 30, 2a, 35, 3d, 3e, 52, 2d, 40, 5a, 41, 42, 46, 49, 33, 4a, 4b, 4c, 4e, 5e.
$__System.registerDynamic(
  '5f',
  [
    '2c',
    'e',
    '11',
    '13',
    '19',
    '12',
    '14',
    '1a',
    '18',
    '1c',
    '28',
    '2b',
    '26',
    '32',
    '29',
    '17',
    '58',
    '2f',
    '1b',
    '27',
    '30',
    '2a',
    '35',
    '3d',
    '3e',
    '52',
    '2d',
    '40',
    '5a',
    '41',
    '42',
    '46',
    '49',
    '33',
    '4a',
    '4b',
    '4c',
    '4e',
    '5e',
  ],
  !0,
  function ($__require, exports, module) {
    'use strict';
    var global = this || self,
      GLOBAL = global,
      _polyfill = $__require('2c'),
      $ = $__require('e'),
      StringUtils = $__require('11'),
      NodeDef = $__require('13'),
      Node = NodeDef.Node,
      TYPE = NodeDef.TYPE,
      MarkParser = $__require('19'),
      Node2Mark = $__require('12'),
      Node2HTML = $__require('14'),
      NodeOperation = $__require('1a'),
      Fences = $__require('18'),
      MathBlock = $__require('1c'),
      MathInline = $__require('28'),
      Brush = $__require('2b'),
      AutoComplete = $__require('26'),
      Selection = $__require('32'),
      rangy = Selection.rangy,
      EditHelper = $__require('29'),
      HTMLBlock = $__require('17'),
      TableEdit = $__require('58'),
      ImageEdit = $__require('2f'),
      UndoManager = $__require('1b'),
      SnapFlag = UndoManager.SnapFlag,
      KeyMaster = $__require('27'),
      keyNames = KeyMaster.map,
      UserOp = $__require('30'),
      MediaOp = $__require('2a'),
      FileInfoPanel = $__require('35'),
      File = $__require('3d'),
      FileAction = $__require('3e'),
      DocMenu = $__require('52'),
      Stylize = $__require('2d'),
      SearchPanel = $__require('40'),
      Emoji = $__require('5a'),
      WordCount = $__require('41'),
      Word = $__require('42'),
      Export = $__require('46'),
      SourceView = $__require('49'),
      FileHelper = $__require('33'),
      LocalSettingBridge = $__require('4a'),
      QuickOpenPanel = $__require('4b'),
      ContextMenu = $__require('4c'),
      SpellCheck = $__require('4e'),
      Library = $__require('5e'),
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
        (this.sessionStr = sessionStr),
          (this.EditHelper = EditHelper),
          (this.MarkParser = MarkParser),
          (this.writingArea = document.querySelector(this.sessionStr)),
          fileController.setEditor(this),
          fileController.readOption(),
          (fileController._onInitTheme = !0),
          fileController.setTheme(),
          setTimeout(function () {
            fileController._onInitTheme = !1;
          }, 300),
          (this.nodeMap = new NodeDef.NodeMap()),
          (this.imgEdit = new ImageEdit(this)),
          (this.docMenu = new DocMenu(this)),
          (this.undo = new UndoManager(this)),
          (this.localSettingBridge = new LocalSettingBridge(this)),
          fileController.exitOversize(),
          this.registerBridge(),
          fileController.setup(),
          fileController.loadFile(fileController.option.initFilePath),
          (this.library = new Library(this)),
          this.library.init(),
          (this._pasteboard = {}),
          (this.timerPool_ = {}),
          this._bindGlobal(),
          this._bindKeyEvents(),
          this._bindMouseEvents(),
          (this.focusCid = null),
          (this.selection = new Selection(this)),
          (this.keypressMsg = ''),
          (this.mathInline = new MathInline(this)),
          (this.wordCount = new WordCount(this)),
          (this.brush = new Brush(this)),
          (this.tableEdit = new TableEdit(this)),
          (this.fences = new Fences(this)),
          (this.mathBlock = new MathBlock(this)),
          (this.htmlBlock = new HTMLBlock(this)),
          (this.stylize = new Stylize(this)),
          this.brush.run(),
          (this.UserOp = UserOp),
          (this.searchPanel = new SearchPanel(this)),
          this.writingArea.focus(),
          (this.sourceView = new SourceView(this)),
          (this.emoji = new Emoji(this)),
          (this.word = new Word(this)),
          (this.export = new Export(this)),
          (fileController.isMac || fileController.isNode) &&
            setTimeout(fileController.bindMenu, 200),
          fileController.freshLock(),
          (this.quickOpenPanel = new QuickOpenPanel(this)),
          this.quickOpenPanel.init(),
          (this.spellChecker = new SpellCheck(this)),
          (this.contextMenu = new ContextMenu(this.sessionStr)),
          (this.dropTargetDom = null),
          (this.strollingBySelect = !1),
          this.updateFocusMode(fileController.isFocusMode, !0, !0),
          this.setTypeWriterMode(fileController.isTypeWriterMode, !0, !0),
          setTimeout(function () {
            fileController.option.silentOpenFailure = !1;
          }, 2e3),
          (this.autoComplete = new AutoComplete(this)),
          (this.useIMEKeyboard = !1),
          this.busyModeSource;
      }
      registerBridge() {
        if (File.isMac) {
          var receiver = this;
          bridge.registerHandler('editor.applyChange', function (changePayload, respond) {
            receiver.applyChange(changePayload), respond && respond();
          }),
            bridge.registerHandler('editor.applyFullContent', function (contentPayload, respond) {
              receiver.applyFullContent(contentPayload[0], contentPayload[1]).then(() => {
                respond && respond();
              });
            }),
            bridge.registerHandler('editor.insertText', function (insertedText, respond) {
              receiver.insertText(insertedText), respond && respond();
            }),
            bridge.registerHandler('editor.setPasteboard', function (pasteboardEntry, respond) {
              receiver.setPasteboard(pasteboardEntry[0], pasteboardEntry[1]), respond && respond();
            }),
            bridge.registerHandler('editor.resetPasteboard', function (unusedParameter1, respond) {
              receiver.resetPasteboard(), respond && respond();
            }),
            bridge.registerHandler(
              'window.showNotificationWithTitle',
              function (notificationArgs, respond) {
                EditHelper.showNotificationWithTitle(notificationArgs[0], notificationArgs[1]),
                  respond && respond();
              },
            ),
            bridge.registerHandler('editor.showZoomPanel', function (zoomOptions, respond) {
              EditHelper.showZoomPanel(zoomOptions), respond && respond();
            }),
            bridge.registerHandler('editor.getSpeechText', function (unusedParameter1, respond) {
              respond(UserOp.getSpeechText());
            }),
            bridge.registerHandler('editor.jumpToAnchor', function (initAnchor, respond) {
              '#' == (initAnchor || '')[0] &&
                initAnchor.trim().length > 1 &&
                (File._onInitParse
                  ? (File.option.initAnchor = initAnchor)
                  : (File._scrollTopTimer && clearTimeout(File._scrollTopTimer),
                    (File._scrollTopTimer = setTimeout(() => {
                      receiver.tryOpenUrl(initAnchor);
                    }, 0)))),
                respond && respond();
            });
        }
      }
      beforeSpellChecking() {
        File.isLocked || setAttributeOnlyNeeded(this.writingArea, 'contenteditable', 'true');
        var element = this.writingArea.children[0];
        element && 'false' == element.getAttribute('contenteditable')
          ? (element.setAttribute('contenteditable', 'true'),
            (this.afterSpellChecking = function () {
              element.setAttribute('contenteditable', 'false');
            }))
          : (this.afterSpellChecking = function () {});
      }
      freeLayout() {
        File.isLocked || setAttributeOnlyNeeded(this.writingArea, 'contenteditable', 'true');
      }
      tryEnterBusyModeWithDelay(delayMs) {
        busyLoadTimer && clearTimeout(busyLoadTimer),
          (busyLoadTimer = setTimeout(() => {
            this.tryEnterBusyMode();
          }, delayMs || 100));
      }
      tryEnterBusyMode(contentText, preserveEditable, forceBusyMode) {
        var currentWritingArea = this.writingArea,
          receiver = this;
        function o() {
          !File.inBusyMode && console.sendLog('enter busy mode'),
            (File.inBusyMode = !0),
            (File.editor.brush.interval = 500),
            !preserveEditable &&
              setAttributeOnlyNeeded(currentWritingArea, 'contenteditable', 'false');
        }
        function a(busyModeSource) {
          (busyModeSource &&
            receiver.busyModeSource &&
            receiver.busyModeSource !== busyModeSource) ||
            ((receiver.busyModeSource = null),
            File.inBusyMode && console.sendLog('leave busy mode'),
            (File.inBusyMode = !1),
            (File.editor.brush.interval = 200),
            File.isLocked ||
              (!preserveEditable &&
                setAttributeOnlyNeeded(currentWritingArea, 'contenteditable', 'true')));
        }
        if (void 0 !== forceBusyMode) return void (forceBusyMode ? o() : a());
        const useLowerThreshold = this.useIMEKeyboard || File.isMac;
        if (void 0 !== contentText && null !== contentText) {
          if (File.inBusyMode) return;
          contentText.length > 1e3 * (useLowerThreshold ? 35 : 60)
            ? (o(), (this.busyModeSource = 'content'))
            : a('content');
        } else {
          var htmlLength = currentWritingArea.innerHTML.length,
            exceedsBusyThreshold =
              this.nodeMap.allNodes.length > 1e4 ||
              htmlLength > 1e3 * (useLowerThreshold ? 1500 : 3e3);
          exceedsBusyThreshold ||
            ((htmlLength +=
              1e3 * currentWritingArea.querySelectorAll('img, svg, .CodeMirror').length * 5),
            File.option.showLineNumbersForFence &&
              (htmlLength += 1e3 * currentWritingArea.querySelectorAll('.CodeMirror').length * 2),
            (exceedsBusyThreshold = htmlLength > 1e3 * (useLowerThreshold ? 1200 : 2400))),
            exceedsBusyThreshold ? (o(), (this.busyModeSource = 'html')) : a('html');
        }
      }
      runAllScript() {
        this.scriptTimer && (clearTimeout(this.scriptTimer), (this.scriptTimer = null));
        var writingArea = this.writingArea;
        this.scriptTimer = setTimeout(function () {
          writingArea.querySelectorAll('script[data-run]').forEach(function (d) {
            d.removeAttribute('data-run'), eval(d.textContent);
          });
        }, 100);
      }
      reset(text) {
        window.Reporter.record('editor.reset'),
          (File._onInitParse = !0),
          File.bundle.unsupported && (text = '');
        let html = new NodeDef.Node({
          type: NodeDef.TYPE.raw_edit,
          in: this.nodeMap,
          attachTo: this.nodeMap,
          text: text,
        }).parseFrom({ skips: { old_code: !1 } })[0];
        (this.writingArea.innerHTML = ''),
          File.isMac && html.length > 1e5
            ? (console.debug('hotfix for macOS slowness'),
              setTimeout(() => {
                (this.writingArea.innerHTML = html),
                  this.tryEnterBusyMode(text),
                  document.querySelectorAll('[guest-id]').forEach(window.loadedWebview),
                  window.Reporter.fullValidate();
              }, 0))
            : ((this.writingArea.innerHTML = html),
              this.tryEnterBusyMode(text),
              document.querySelectorAll('[guest-id]').forEach(window.loadedWebview),
              window.Reporter.fullValidate()),
          (this.focusCid = null),
          (this.lastCursor = null),
          (File._needsUpdateSnap = new Date()),
          (File._onInitParse = !1);
        var receiver = this;
        setTimeout(function () {
          receiver.refresh(void 0, void 0, !0),
            receiver.wordCount && receiver.wordCount.update(text);
        }, 80),
          this.spellChecker && this.spellChecker.reset(),
          this.fences && this.fences.onLeaveDocument(),
          this.mathInline && this.mathInline.onLeaveDocument();
      }
      quickRefresh() {
        this.refresh(!1, !0);
      }
      refreshUnder(element, themeOnly, forceMathRefresh) {
        let mathRefreshPromise;
        return (
          themeOnly ||
            ((mathRefreshPromise =
              forceMathRefresh && !File.inBusyMode
                ? this.mathBlock.forceRefresh()
                : this.mathBlock.renderUnder(element, forceMathRefresh)),
            this.docMenu && this.docMenu.refreshFootnoteReverseLink(element)),
          this.fences.modeLoaded && this.fences.refreshEditor(!1, themeOnly, element),
          this.diagrams.modeLoaded &&
            (themeOnly && File.editor.diagrams.loadMermaidTheme(),
            this.diagrams.refreshDiagram(themeOnly, element)),
          !themeOnly && this.htmlBlock && this.htmlBlock.refreshUnder(element),
          element && this.wordCount.quickUpdate(element.getAttribute('cid'), !0),
          mathRefreshPromise
        );
      }
      refresh(themeOnly, skipOutlineRefresh, forceMathRefresh) {
        if (File._onInitParse) return;
        var isActiveWindow = File.isActiveWindow();
        if (this.sourceView && this.sourceView.inSourceMode)
          return void (themeOnly && this.sourceView.cm.refresh());
        if (!this.brush)
          return void (this._brushInitCallback = function () {
            this.refresh(themeOnly, skipOutlineRefresh);
          }.bind(this));
        $(this.writingArea).find('.md-mathblock-panel').length ||
          (this.mathBlock && (this.mathBlock.currentCm = void 0)),
          skipOutlineRefresh || themeOnly || this.nodeMap.toc.refresh(!0);
        let mathRefreshPromise = this.refreshUnder(void 0, themeOnly, forceMathRefresh);
        isActiveWindow &&
          (themeOnly ||
            (this.wordCount.quickUpdate(this.focusCid, !0),
            this.brush &&
              this.stylize &&
              (isInputComponent(document.activeElement) || this.brush.expand(void 0, !0),
              File.isNode && File.refreshImageCopyStatus(!0)),
            this.runAllScript(),
            $('#marklyra-table-row-tracker, #marklyra-table-col-tracker').hide(),
            this.tryEnterBusyModeWithDelay(500),
            mathRefreshPromise &&
              mathRefreshPromise.then(() => {
                this.tryEnterBusyModeWithDelay();
              })));
      }
      getJQueryElem(domNode) {
        return domNode
          ? domNode.nodeType == domNode.ELEMENT_NODE
            ? $(domNode)
            : $(domNode.parentNode)
          : $();
      }
      getMarkElem(domNode) {
        if (
          !domNode &&
          document.activeElement.nodeType == window.Node.ELEMENT_NODE &&
          (('write' !== document.activeElement.id &&
            document.activeElement.hasAttribute('tabindex')) ||
            Node.isType(document.activeElement.tagName, 'TEXTAREA', 'INPUT'))
        )
          return $(document.activeElement).closest('[cid]');
        if (!(domNode = domNode || window.getSelection().focusNode || document.activeElement))
          return [];
        var element = domNode.nodeType == domNode.ELEMENT_NODE ? $(domNode) : $(domNode.parentNode);
        return (
          !element.length ||
            ('TH' !== element[0].tagName && 'TD' !== element[0].tagName) ||
            (element = element.children('.td-span')),
          StringUtils.isNullOrEmpty(element.attr('cid')) && (element = element.closest('[cid]')),
          element
        );
      }
      autoRemoveUnholdable(preservePlaceholder) {
        var element = this.focusCid && this.findElemById(this.focusCid).closest('.unholdable');
        if (element && element.length)
          try {
            if ((this.undo.endSnap(!0), element.next().length || element.text().length))
              element.removeClass('unholdable');
            else {
              var placeholderNode = this.findNodeByElem(element),
                removeCommand =
                  removeCommand || UndoManager.makeEmptyCommand(this.selection.buildUndo()),
                range = this.selection.getRangy();
              if (
                element[0] &&
                (range.commonAncestorContainer === element[0] ||
                  element[0].contains(range.commonAncestorContainer))
              )
                return;
              this.undo.UndoManager.addUndoForRemove(removeCommand, placeholderNode),
                removeCommand.redo.push(this.selection.buildUndo(range));
              var firstSibling = placeholderNode.getVeryFirstBrother(!0, !0);
              if (!firstSibling) return;
              preservePlaceholder ||
                (placeholderNode.remove(),
                element.remove(),
                this.selection.jumpIntoElemEnd(this.findElemById(firstSibling.cid)),
                removeCommand.redo.push(this.selection.buildUndo()),
                this.undo.register(removeCommand),
                this.refocus(firstSibling.cid, !1, !0));
            }
          } catch (error) {
            console.warn(error.stack);
          }
        else
          $('#write .unholdable')
            .filter(function () {
              return this.textContent.length;
            })
            .removeClass('unholdable');
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
              var text = nodeElement.rawText(!0);
              return (
                Node.isType(documentNode, TYPE.hr, TYPE.toc) ||
                  (Node.isType(documentNode, TYPE.meta_block)
                    ? ((text = text.replace(/\n$/, '')), documentNode.set('text', text))
                    : Node.isType(documentNode, TYPE.math_block)
                      ? nodeElement.find('.CodeMirror-code').length &&
                        this.mathBlock.syncToNode(documentNode)
                      : Node.isType(documentNode, TYPE.fences)
                        ? nodeElement.find('.CodeMirror-code').length &&
                          this.fences.syncToNode(documentNode)
                        : Node.isType(documentNode, TYPE.html_block)
                          ? nodeElement.find('.CodeMirror-code').length &&
                            this.htmlBlock.syncToNode(documentNode)
                          : Node.isType(documentNode, TYPE.def_footnote, TYPE.def_link)
                            ? Node.reverseAttrFromElem(
                                documentNode,
                                nodeElement.clone(),
                                void 0,
                                !0,
                              )
                            : Node.isType(
                                  documentNode,
                                  TYPE.heading,
                                  TYPE.raw_edit,
                                  TYPE.paragraph,
                                  TYPE.table_cell,
                                ) && !nodeElement[0].querySelector('[cid]')
                              ? Node.isType(documentNode, TYPE.paragraph)
                                ? documentNode.set('text', text.replace(/^( {4}|\t)/, '​$1'))
                                : documentNode.set('text', text)
                              : storeChildren &&
                                documentNode.get('children').map(function (item) {
                                  nodeElement[0].querySelector("[cid='" + item.cid + "']")
                                    ? this.store(item)
                                    : item.remove();
                                }, this)),
                documentNode && this.wordCount.quickUpdate(documentNode, !1, !0),
                Node.isType(documentNode, Node.TYPE.meta_block) &&
                  !storeChildren &&
                  this.imgEdit.updateLocalRootUrl(),
                documentNode
              );
            }
            this.focusCid = null;
          }
        }
      }
      cleanTooltip() {
        $('content').find('.auto-suggest-container.marklyra-show').removeClass('marklyra-show'),
          normalCleanTooltip_(),
          this.mathBlock.stopEditing();
      }
      refocus(focusCid, storeTarget, skipExpansion, enableStartMatch, skipParsing) {
        if ((clickTimer && clearTimeout(clickTimer), this.isIME)) return focusCid;
        if (!this.sourceView || !this.sourceView.inSourceMode) {
          var parseResult,
            element = focusCid ? this.findElemById(focusCid) : this.getMarkElem(),
            receiver = this,
            currentFocusCid = this.nodeMap.allNodes.get(this.focusCid),
            nodeElement = receiver.findElemById(this.focusCid);
          if (
            (receiver.library && receiver.library.outline.autoHideOutline(),
            focusCid &&
              element.find('[cid]').length &&
              (focusCid = (element = this.getMarkElem()).attr('cid')),
            (focusCid = void 0 === focusCid ? element.attr('cid') : focusCid),
            storeTarget && focusCid && receiver.store(focusCid),
            this.focusCid != focusCid || !element.hasClass('md-focus'))
          ) {
            if (
              (this.focusCid != focusCid &&
                (function () {
                  var currentNodeElement = receiver.findElemById(receiver.focusCid);
                  skipParsing
                    ? currentNodeElement.trigger('endfocus')
                    : currentNodeElement.trigger('blur').trigger('losefocus'),
                    currentNodeElement.find('.md-tooltip-hide').hide(),
                    normalCleanTooltip_(),
                    Node.isType(currentFocusCid, Node.TYPE.paragraph) &&
                      currentFocusCid.unset('depth'),
                    receiver.undo.endSnap();
                })(),
              this.focusCid == focusCid)
            )
              return (
                element.hasClass('md-focus') || element.addClass('md-focus').trigger('refocus'),
                focusCid
              );
            var incompleteCommand;
            if (
              ((incompleteCommand = this.undo.lastRegisteredOperationCommand()) &&
                !incompleteCommand.incomplete &&
                (incompleteCommand = null),
              this.store(this.focusCid),
              this.lastCursor &&
                this.lastCursor.startId === this.lastCursor.endId &&
                this.lastCursor.startId &&
                (this.lastCursor.id = this.lastCursor.startId),
              incompleteCommand &&
                this.lastCursor &&
                this.focusCid == this.lastCursor.id &&
                (incompleteCommand.redo.push(this.lastCursor),
                receiver.undo.endSnap(!0),
                (incompleteCommand = null)),
              element.hasClass('.md-meta-block') && element[0].normalize(),
              element.addClass('md-focus').trigger('refocus'),
              $(document.activeElement).trigger('focus'),
              File.option.expandSimpleBlock && (this.focusCid = UserOp.simpleExpand(this, focusCid))
                ? ('block' == document.querySelector('#md-searchpanel').style.display &&
                    this.searchPanel.closePanel(),
                  (focusCid = this.focusCid))
                : (skipExpansion || skipParsing || this.brush.expandOnDelay(!1),
                  this.wordCount.quickUpdate(focusCid),
                  (this.focusCid = focusCid)),
              File.isLocked)
            )
              return this.focusCid;
            ((this.focusCid &&
              currentFocusCid &&
              !(
                $.contains(nodeElement, element) ||
                $.contains(element, nodeElement) ||
                (element.length && element.is(nodeElement))
              )) ||
              (currentFocusCid && !this.focusCid)) &&
              (parseResult = !skipParsing && this.simpleParse(currentFocusCid, enableStartMatch)) &&
              ((parseResult[0].undo[0] = receiver.lastCursor),
              setTimeout(function () {
                parseResult[0].redo.push(receiver.selection.buildUndo()),
                  receiver.findElemById(parseResult[2]).replaceWith(parseResult[1]),
                  incompleteCommand
                    ? (UndoManager.append(incompleteCommand, parseResult[0]),
                      (parseResult[0] = incompleteCommand))
                    : receiver.undo.register(parseResult[0], !0),
                  receiver.quickRefresh(),
                  receiver.selection.scrollAdjust(),
                  receiver.undo.exeCommand(parseResult[0].redo.last());
              }, 50)),
              receiver.undo.endSnap(!0),
              this.library.outline.highlightVisibleHeader(),
              this.focusCid && this.brush.focusContainer(element);
          }
          return (
            (receiver.isIME = 0),
            skipExpansion || skipParsing || this.brush.expandOnDelay(),
            focusCid
          );
        }
      }
      focusAndRestorePos() {
        if (
          document.activeElement != this.writingArea &&
          !this.writingArea.contains(document.activeElement)
        ) {
          var scrollContainer = $('content'),
            scrollTop = scrollContainer.scrollTop();
          this.writingArea.focus(), scrollContainer.scrollTop(scrollTop);
        }
      }
      resetPasteboard() {
        this._pasteboard = {};
      }
      setPasteboard(format, content) {
        (this._pasteboard = this._pasteboard || {}), (this._pasteboard[format] = content);
      }
      _bindGlobal() {
        var timerId,
          receiver = this;
        function n() {
          $('.marklyra-table-edit').length &&
            receiver.tableEdit.resizeTableEdit($('.marklyra-table-edit').next()),
            $('.marklyra-table-tracker').hide(),
            receiver.setTypeWriterMode(File.isTypeWriterMode, !0),
            (timerId = null);
        }
        File.option.moveColLeftKey &&
          KeyMaster(File.option.moveColLeftKey, function (event) {
            File.editor.tableEdit.moveColLeftOrRight(!0) &&
              (event.preventDefault(), event.stopPropagation());
          }),
          File.option.moveColRightKey &&
            KeyMaster(File.option.moveColRightKey, function (event) {
              File.editor.tableEdit.moveColLeftOrRight(!1) &&
                (event.preventDefault(), event.stopPropagation());
            }),
          File.option.moveRowUpKey &&
            KeyMaster(File.option.moveRowUpKey, function (event) {
              File.editor.UserOp.moveRowUpOrDown(!0),
                event.preventDefault(),
                event.stopPropagation();
            }),
          File.option.moveRowDownKey &&
            (KeyMaster(File.option.moveRowDownKey, function (event) {
              File.editor.UserOp.moveRowUpOrDown(!1),
                event.preventDefault(),
                event.stopPropagation();
            }),
            File.isMac &&
              (KeyMaster(File.option.jumpToLineStartKey, function (event) {
                event.preventDefault(), File.editor.selection.jumpToLineStart();
              }),
              KeyMaster(File.option.jumpToLineEndKey, function (event) {
                event.preventDefault(), File.editor.selection.jumpToLineEnd();
              }))),
          File.isNodeHtml
            ? (KeyMaster('ctrl+home', function (unusedParameter1) {
                File.editor.selection.jumpTop();
              }),
              KeyMaster('ctrl+end', function (unusedParameter1) {
                File.editor.selection.jumpBottom();
              }),
              KeyMaster('end', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!0, null, !1, !0);
                }, 0);
              }),
              KeyMaster('home', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!1, null, !1, !0);
                }, 0);
              }),
              KeyMaster('shift+end', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!0, null, !1, !1);
                }, 0);
              }),
              KeyMaster('shift+home', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!1, null, !1, !1);
                }, 0);
              }),
              KeyMaster('ctrl+z, command+z', function (keyboardEvent) {
                return ClientCommand.undo(keyboardEvent), !1;
              }),
              KeyMaster(
                'ctrl+y, command+y, command+shift+z, ctrl+shift+z',
                function (keyboardEvent) {
                  return ClientCommand.redo(keyboardEvent), !1;
                },
              ))
            : (KeyMaster('ctrl+k', function (event) {
                var selectionRange = receiver.selection.getRangy();
                if (selectionRange && !isInputComponent(document.activeElement)) {
                  if (selectionRange.collapsed) {
                    var currentElement = receiver.getMarkElem();
                    selectionRange.setEnd(currentElement[0], currentElement[0].childNodes.length),
                      receiver.selection.setRange(selectionRange, !0);
                  }
                  selectionRange.toString().length
                    ? UserOp.backspaceHandler(receiver, event, 'delSelection')
                    : UserOp.backspaceHandler(receiver, event, !0),
                    event.preventDefault(),
                    event.stopPropagation();
                }
              }),
              KeyMaster('command+right', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!0, null, !1, !0);
                }, 0);
              }),
              KeyMaster('command+left', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!1, null, !1, !0);
                }, 0);
              }),
              KeyMaster('command+shift+right', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!0, null, !1, !1);
                }, 0);
              }),
              KeyMaster('command+shift+left', function (unusedParameter1) {
                setTimeout(function () {
                  File.editor.selection.fixExtendToLineEdge(!1, null, !1, !0);
                }, 0);
              }),
              KeyMaster('command+up, command+down', function (unusedParameter1) {
                setTimeout(function () {
                  receiver.refocus();
                }, 0);
              }),
              KeyMaster('ctrl+h', function (keyboardEvent) {
                receiver.selection.getRangy() &&
                  !isInputComponent(document.activeElement) &&
                  UserOp.backspaceHandler(receiver, keyboardEvent, 'Backspace');
              }),
              KeyMaster('ctrl+d', function (keyboardEvent) {
                receiver.selection.getRangy() &&
                  !isInputComponent(document.activeElement) &&
                  UserOp.backspaceHandler(receiver, keyboardEvent, 'Delete');
              }),
              KeyMaster('ctrl+tab', function (unusedParameter1) {
                File.isMac && bridge.callHandler('window.selectNextTab');
              }),
              KeyMaster('ctrl+shift+tab', function (unusedParameter1) {
                File.isMac && bridge.callHandler('window.selectPreviousTab');
              }),
              KeyMaster('command+y', function (keyboardEvent) {
                if (File.isLocked) return !1;
                File.editor.undo.redo(keyboardEvent), File.freshMenu();
              })),
          File.isMac ||
            File.isNode ||
            (File.isNodeHtml ||
              (KeyMaster('command+z, ctrl+z', function (keyboardEvent) {
                if (File.isLocked) return !1;
                receiver.writingArea.contains(keyboardEvent.target) &&
                  receiver.undo.undo(keyboardEvent);
              }),
              KeyMaster('ctrl+y', function (keyboardEvent) {
                if (File.isLocked) return !1;
                receiver.writingArea.contains(keyboardEvent.target) &&
                  receiver.undo.redo(keyboardEvent);
              })),
            KeyMaster('command+l, ctrl+l', function (event) {
              event.preventDefault(), receiver.selection.selectLine();
            }),
            KeyMaster('command+d, ctrl+d', function (event) {
              event.preventDefault(), receiver.selection.selectWord();
            }),
            KeyMaster('command+e, ctrl+e', function (event) {
              event.preventDefault(), receiver.selection.selectPhrase();
            }),
            KeyMaster('command+a, ctrl+a', function (event) {
              event.preventDefault(), receiver.selection.selectAll();
            }),
            KeyMaster('shift+command+d, shift+ctrl+d', function (event) {
              if (File.isLocked) return !1;
              event.preventDefault(),
                receiver.selection.selectWord(),
                UserOp.backspaceHandler(receiver, null, 'delSelection');
            })),
          File.isNodeHtml &&
            (function () {
              var useCommandKey = File.isMac || File.isMacNode;
              if (
                (KeyMaster(useCommandKey ? 'command+b' : 'ctrl+b', function (event) {
                  if (File.isLocked) return !1;
                  event.preventDefault(), receiver.stylize.toggleStyle(NodeDef.TYPE.strong);
                }),
                KeyMaster(useCommandKey ? 'command+i' : 'ctrl+i', function (event) {
                  if (File.isLocked) return !1;
                  event.preventDefault(), receiver.stylize.toggleStyle(NodeDef.TYPE.em);
                }),
                KeyMaster(useCommandKey ? 'command+u' : 'ctrl+u', function (event) {
                  if (File.isLocked) return !1;
                  event.preventDefault(), receiver.stylize.toggleStyle(NodeDef.TYPE.underline);
                }),
                KeyMaster(useCommandKey ? 'command+a' : 'ctrl+a', function (event) {
                  event.preventDefault(), File.isNodeHtml && ClientCommand.selectAll();
                }),
                File.isNode)
              ) {
                let pasteShortcut = File.option.keys['Paste as Plain Text'] || 'ctrl+shift+v';
                pasteShortcut &&
                  KeyMaster(pasteShortcut, function (event) {
                    ClientCommand.pasteAsPlain(), event.preventDefault();
                  }),
                  'ctrl+v' != (pasteShortcut = File.option.keys.Paste) &&
                    KeyMaster(pasteShortcut, function (event) {
                      ClientCommand.paste(), event.preventDefault();
                    });
              }
              if (File.isMacNode || File.isLinux) {
                let sourceModeShortcut = File.option.keys['Source Code Mode'] || 'CmdOrCtrl+/';
                KeyMaster(sourceModeShortcut, function (event) {
                  File.toggleSourceMode(), event.preventDefault();
                });
              }
            })(),
          $(document)
            .on('dragover', function (dragEvent) {
              dragEvent.originalEvent.dataTransfer.dropEffect = 'none';
            })
            .on('dragstart', function (dropEvent) {
              if (receiver.writingArea.contains(dropEvent.target)) return !1;
            })
            .on('drop', function (event) {
              event.stopPropagation(),
                event.preventDefault(),
                setTimeout(function () {
                  receiver.resetPasteboard();
                }, 0);
              var dataTransfer = event.originalEvent.dataTransfer;
              if (receiver.library.draggingItem || dataTransfer.getData('file'))
                return receiver.library.clearDraggingItem(), !1;
              var htmlContent = dataTransfer.getData('text/html'),
                plainText = dataTransfer.getData('text/plain'),
                items = receiver._pasteboard.files || [];
              function a() {
                var range = document.caretRangeFromPoint(
                  event.originalEvent.x,
                  event.originalEvent.y,
                );
                range &&
                  range.startContainer &&
                  (receiver.writingArea == range.startContainer ||
                    receiver.writingArea.contains(range.startContainer)) &&
                  ('BODY' == document.activeElement.tagName && receiver.writingArea.focus(),
                  receiver.selection.setRange(range),
                  (receiver.lastCursor = receiver.selection.buildUndo()),
                  receiver.refocus());
              }
              if (((items = items || []), receiver._pasteboard.urlWithTitle)) {
                if (!FileAction.isKeyWindow()) return !1;
                a(),
                  UserOp.insertUrlWithTitle(
                    receiver,
                    receiver._pasteboard.urlWithTitle[0],
                    receiver._pasteboard.urlWithTitle[1],
                  );
              } else if (receiver._pasteboard.image) {
                if (!FileAction.isKeyWindow()) return !1;
                a(), MediaOp.insertURL(receiver._pasteboard.image);
              } else if (htmlContent) {
                if (!FileAction.isKeyWindow()) return !1;
                a(),
                  setTimeout(function () {
                    UserOp.pasteHandler(receiver, htmlContent);
                  }, 20);
              } else if (items.length || (dataTransfer.files && dataTransfer.files.length)) {
                if (File.isNodeHtml)
                  for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                    var filePath = MediaOp.getPathForFile(dataTransfer.files.item(fileIndex));
                    filePath && items.push(filePath);
                  }
                else if (!items.length) {
                  var uriList = dataTransfer.getData('text/uri-list');
                  uriList && (items = items.concat(uriList));
                }
                if (!items.length) return !1;
                FileAction.onDropFile(items, dataTransfer, a);
              } else {
                if (!plainText) return !1;
                if (!FileAction.isKeyWindow()) return !1;
                a(),
                  setTimeout(function () {
                    UserOp.pasteHandler(receiver, plainText);
                  }, 20);
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
              if (File.isLocked) return !1;
              if (
                File.isMac &&
                (receiver.sourceView.inSourceMode || isInputComponent(document.activeElement))
              )
                bridge.callHandler('window.pasteAsPlainText');
              else if (!receiver.sourceView.inSourceMode)
                return UserOp.pasteHandler(receiver, pasteEvent.originalEvent, !0);
            })
            .on('copy', this.sessionStr, function (event) {
              console.debug('on copy'),
                isInputComponent(document.activeElement) ||
                  (UserOp.beforeCopyStart(receiver),
                  UserOp.copyHandler(receiver, event.originalEvent)),
                event.stopPropagation();
            })
            .on('copy', function (copyEvent) {
              copyEvent.target == document.body &&
                receiver.writingArea.contains(document.activeElement) &&
                document.activeElement != copyEvent.target &&
                (isInputComponent(document.activeElement) ||
                  UserOp.copyHandler(receiver, copyEvent.originalEvent));
            })
            .on('cut', function (cutEvent) {
              cutEvent.target == document.body &&
                receiver.writingArea.contains(document.activeElement) &&
                document.activeElement != cutEvent.target &&
                (isInputComponent(document.activeElement) ||
                  (UserOp.copyHandler(receiver, cutEvent.originalEvent),
                  UserOp.backspaceHandler(receiver, cutEvent, 'delSelection')));
            })
            .on('cut', this.sessionStr, function (event) {
              if ((event.stopPropagation(), File.isLocked)) return !1;
              if (isInputComponent(document.activeElement)) return !0;
              function n() {
                let selectionSnapshot =
                    File._CopyContentRange && receiver.selection.buildUndo(File._CopyContentRange),
                  cutCommand = UserOp.backspaceHandler(receiver, null, 'delSelection');
                if (cutCommand && File._CopyContentRange) {
                  cutCommand.undo.unshift(selectionSnapshot);
                  let cleanupCommand = UserOp.backspaceHandler(receiver, null, !0, !0);
                  cleanupCommand && UndoManager.append(cutCommand, cleanupCommand);
                }
              }
              if (File.isNode)
                return (
                  (File._CopyContentFlag = 'cut_before'),
                  (File._CopyContentRange = null),
                  JSBridge.invoke('webContents.copy'),
                  !1
                );
              receiver.refocus(void 0, !0, !0),
                UserOp.copyHandler(receiver, event.originalEvent, n) && n();
            })
            .on('contextmenu', function (pointerEvent) {
              if (File.isMac) {
                if ('TITLEBAR' == pointerEvent.target.tagName) return;
                var menuItems = [];
                if (File.isWK && 'IFRAME' == pointerEvent.target.tagName) {
                  var elementAtPoint = document.elementFromPoint(
                    pointerEvent.clientX,
                    pointerEvent.clientY,
                  );
                  menuItems = receiver.contextMenu.getMenuItemsForMac(elementAtPoint);
                } else menuItems = receiver.contextMenu.getMenuItemsForMac(pointerEvent.target);
                0 == menuItems.length
                  ? (pointerEvent.preventDefault(), pointerEvent.stopPropagation())
                  : window.bridge.callSync('contextMenu.setItems', menuItems);
              }
            })
            .on('contextmenu', this.sessionStr, function (doubleClickEvent) {
              var selectionRange,
                element = $(doubleClickEvent.target);
              if (
                (element.closest('.CodeMirror')[0] ||
                  (Node.isType(
                    receiver.getMarkElem(doubleClickEvent.target).attr('mdtype'),
                    Stylize.CONST.Selectable,
                  )
                    ? window.getSelection().removeAllRanges()
                    : ((selectionRange = receiver.selection.getRangy()) &&
                        '' == selectionRange.toString() &&
                        (selectionRange.collapse(!0),
                        selectionRange.select(selectionRange.isBackward)),
                      File.isNodeHtml && File.editor.brush.expand())),
                'IMG' === doubleClickEvent.target.tagName && element.closest('.md-image').length)
              ) {
                $('.md-expand').removeClass('md-expand');
                var imageElement = element.closest('.md-image').addClass('md-expand');
                if (!imageElement.length) return;
                (selectionRange = rangy.createRange()).selectNodeContents(
                  imageElement.children('.md-meta')[0],
                ),
                  receiver.selection.setRange(selectionRange, !0),
                  File.editor.brush.expand();
              }
              File.isNodeHtml && File.editor.contextMenu.show(doubleClickEvent);
            })
            .on('click', '#md-notification .undo-btn', function () {
              receiver.undo.undo(), document.body.classList.remove('marklyra-show-notification');
            })
            .on('click', '#md-notification .ok-btn', function () {
              document.body.classList.remove('marklyra-show-notification');
            })
            .on('focus', 'body', function (selectEvent) {
              if (selectEvent.target == document.body) return !1;
            })
            .on('click', EditHelper.resetClick),
          $(window)
            .on('resize', function () {
              File.suppressResize ||
                (timerId && clearTimeout(timerId), (timerId = setTimeout(n, 300)));
            })
            .on('mouseup', function (pointerEvent) {
              receiver.selection.clearGlobalColumn(),
                receiver.stopScrolling(),
                1 == pointerEvent.which && receiver.wordCount.updateInSelection();
            }),
          window.addEventListener('mac.enterFullscreen', function () {
            $('body').addClass('marklyra-fullscreen'), $('#top-hotpot, #bottom-hotpot').show();
          }),
          window.addEventListener('mac.exitFullscreen', function () {
            $('body').removeClass('marklyra-fullscreen'), $('#top-hotpot, #bottom-hotpot').hide();
          }),
          File.isMac &&
            ($('#top-hotpot').on('mouseenter', function (pointerEvent) {
              1 == pointerEvent.which && receiver.startScrolling(!0);
            }),
            $('#bottom-hotpot').on('mouseenter', function (pointerEvent) {
              1 == pointerEvent.which && receiver.startScrolling(!1);
            }),
            $('#top-hotpot').on('mouseleave', function (unusedParameter1) {
              receiver.stopScrolling();
            }),
            $('#bottom-hotpot').on('mouseleave', function (pointerEvent) {
              pointerEvent.screenY + 4 > window.innerHeight || receiver.stopScrolling();
            })),
          $(receiver.sessionStr).on('change', "[type='checkbox']", function () {
            var nodeId = this.parentElement.getAttribute('cid'),
              checked = this.checked;
            checked ? this.setAttribute('checked', 'checked') : this.removeAttribute('checked'),
              receiver.getNode(nodeId).attr('checked', checked, receiver, !1);
          }),
          document.addEventListener(
            'selectionchange',
            function (unusedParameter1) {
              var selectionRange;
              File.isNodeHtml &&
                ((selectionRange = receiver.selection.getRangy()),
                $('svg.in-text-selection').attr('class', ''),
                selectionRange &&
                  selectionRange.getNodes([1], function (domNode) {
                    'svg' === domNode.tagName && domNode.classList.add('in-text-selection');
                  })),
                File.isFocusMode && enterFocusMode.call(receiver);
            },
            !1,
          );
      }
      _bindKeyEvents() {
        var timerId,
          focusCid,
          currentTimerId,
          shortCompositionRange,
          receiver = this,
          keyupSeen = !1,
          shiftPressed = !1;
        function s(showPointer) {
          fastdom.mutate(function () {
            document
              .querySelector('#write')
              .querySelectorAll('a, .md-def-url, .md-url')
              .forEach(function (item) {
                item.style.cursor = showPointer ? 'pointer' : '';
              });
          });
        }
        (receiver.isIME = 0),
          (receiver.lastKeydownEvent = null),
          $(document.body).on('keydown', function (keyboardEvent) {
            if (!(keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey)) {
              receiver.library.outline.autoHideOutline();
              var classList = document.body.classList;
              (classList.contains('marklyra-show-word-count') ||
                classList.contains('marklyra-show-spell-check')) &&
                (classList.remove('marklyra-show-word-count'),
                classList.remove('marklyra-show-spell-check'));
              var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
              if (EditHelper.keyOnControl(keyNames[keyCode], keyboardEvent)) return !1;
              if (
                document.activeElement == document.body &&
                !document.body.classList.contains('modal-open')
              ) {
                var range = window.getSelection();
                if (
                  !range ||
                  !range.startContainer ||
                  !receiver.writingArea.contains(startContainer)
                )
                  return !1;
                var scrollTop = $('content').scrollTop();
                receiver.writingArea.focus(),
                  ('Delete' != keyNames[keyCode] &&
                    'Backspace' != keyNames[keyCode] &&
                    'Enter' != keyNames[keyCode]) ||
                    (console.debug('keydown on document.body ?'),
                    keyboardEvent.originalEvent != receiver.lastKeydownEvent &&
                      ((keyboardEvent.target = receiver.writingArea),
                      (receiver.lastKeydownEvent = keyboardEvent.originalEvent),
                      $(receiver.sessionStr).trigger(keyboardEvent)),
                    keyboardEvent.preventDefault()),
                  'IFRAME' == keyboardEvent.target.tagName && keyboardEvent.stopPropagation(),
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
          h = function (compositionEvent) {
            if (receiver.isIME && !isInputComponent(document.activeElement)) {
              (receiver.useIMEKeyboard = !0),
                compositionEvent &&
                  ((compositionInputState = -1),
                  setTimeout(function () {
                    compositionInputState = 0;
                  }, 0)),
                console.debug('compositionEnd');
              var range,
                currentElement,
                compositionNode,
                element = receiver.getMarkElem();
              element.length ||
                ((range = receiver.selection.getRangy()),
                (currentElement = $(range.startContainer).closest('[cid]')),
                (compositionNode = receiver.findNodeByElem(currentElement)) &&
                  currentElement.replaceWith(compositionNode.toHTML())),
                (receiver.focusCid = element.attr('cid')),
                receiver.brush.addToQueue(receiver.focusCid),
                (receiver.isIME = 0),
                setTimeout(function () {
                  receiver.brush.brushQueue();
                }, 10),
                receiver.undo.addSnap(receiver.focusCid, SnapFlag.ADD);
            }
          },
          p = function (compositionEvent) {
            compositionEvent && (compositionInputState = -1),
              isInputComponent(document.activeElement) ||
                receiver.isIME ||
                (console.debug('compositionStart'),
                receiver.selection.prepNode('', compositionEvent, !1, !0),
                (receiver.isIME = 1));
          },
          f = function () {
            editableSnapshot &&
              !0 !== editableSnapshot &&
              (editableSnapshot[1]
                ? (editableSnapshot[0].attr('contenteditable', editableSnapshot[1]),
                  editableSnapshot[2] &&
                    editableSnapshot[2].attr('contenteditable', editableSnapshot[3]))
                : (editableSnapshot[0].removeAttr('contenteditable'),
                  editableSnapshot[2] && editableSnapshot[2].removeAttr('contenteditable')),
              editableSnapshot[4] && receiver.selection.setRange(editableSnapshot[4])),
              (editableSnapshot = !1),
              localTimerId && clearTimeout(localTimerId),
              (localTimerId = null);
          };
        function m(element) {
          localTimerId && clearTimeout(localTimerId),
            (element = element || receiver.findElemById(receiver.focusCid)),
            console.debug('lock', element[0]);
          var editableAttribute = element.attr('contenteditable'),
            selectionRange = receiver.selection.getRangy();
          (editableSnapshot = 'false' !== editableAttribute) &&
            (element.attr('contenteditable', 'false'),
            (editableSnapshot = [element, editableAttribute, null, null, selectionRange])),
            (localTimerId = setTimeout(f, 100));
        }
        $(receiver.sessionStr)
          .on('keydown', function (keyboardEvent) {
            (receiver.lastKeydownEvent = keyboardEvent.originalEvent),
              (receiver.keypressMsg = null);
            var searchValue = keyboardEvent.keyCode || keyboardEvent.which,
              isInputTarget = isInputComponent(keyboardEvent.target);
            if (229 != searchValue) {
              if (
                ('Tab' != keyNames[searchValue] ||
                  keyboardEvent.ctrlKey ||
                  keyboardEvent.altKey ||
                  keyboardEvent.stopPropagation(),
                receiver &&
                  receiver.contextMenu &&
                  receiver.contextMenu.handleKeyEvent(keyboardEvent))
              )
                return !1;
              if (
                receiver.autoComplete &&
                !1 === receiver.autoComplete.handleKeyEvents(keyboardEvent)
              )
                return !1;
              if (EditHelper.keyOnControl(keyNames[searchValue], keyboardEvent, !0)) return !1;
              if (document.body.classList.contains('megamenu-opened'))
                'Esc' === keyNames[searchValue] && File.megaMenu.hide();
              else {
                if (
                  ($('.dropdown-menu.open:not(#marklyra-sidebar), .dropdown-menu.show')
                    .removeClass('open')
                    .removeClass('show')
                    .find('.active')
                    .removeClass('active'),
                  $('.marklyra-tooltip').removeClass('shown'),
                  ('Ctrl' != keyNames[searchValue] && 'Command' != keyNames[searchValue]) || s(!0),
                  Node.isType(keyNames[searchValue], 'Right', 'Left', 'Up', 'Down'))
                ) {
                  if (
                    ($('.context-menu.show').length &&
                      receiver.contextmenu.handleArrowKey(keyNames[searchValue]),
                    keyboardEvent.target.classList &&
                      keyboardEvent.target.classList.contains('marklyra-input') &&
                      !keyboardEvent.ctrlKey &&
                      !keyboardEvent.metaKey)
                  ) {
                    if (
                      ((range = receiver.selection.getRangy()),
                      'Left' == keyNames[searchValue] &&
                        0 == range.startOffset &&
                        0 == range.endOffset)
                    )
                      return receiver.selection.moveUpOrDown(!0, keyboardEvent, !0), !1;
                    if (
                      'Right' == keyNames[searchValue] &&
                      range.startOffset == range.endOffset &&
                      range.endOffset == keyboardEvent.target.textContent.length
                    )
                      return receiver.selection.moveUpOrDown(!1, keyboardEvent, !0), !1;
                  }
                  if (isInputTarget && Node.isType(keyNames[searchValue], 'Right', 'Left')) return;
                  if (File.isLocked) return !0;
                  if (
                    (File.inBusyMode &&
                      keyboardEvent &&
                      (keyboardEvent.shiftKey || keyboardEvent.metaKey || keyboardEvent.ctrlK) &&
                      setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true'),
                    $((receiver.selection.getRangy() || {}).commonAncestorContainer).closest(
                      'table.md-table',
                    ).length && !1 === receiver.tableEdit.keydownHandler(keyboardEvent))
                  )
                    return !1;
                  if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
                    if (
                      File.isMac &&
                      keyboardEvent.metaKey &&
                      !keyboardEvent.ctrlKey &&
                      !keyboardEvent.altKey &&
                      ('Up' == keyNames[searchValue] || 'Down' == keyNames[searchValue])
                    )
                      return (
                        'Up' == keyNames[searchValue]
                          ? receiver.selection.jumpTop(keyboardEvent.shiftKey)
                          : receiver.selection.jumpBottom(keyboardEvent.shiftKey),
                        !1
                      );
                    if (
                      keyboardEvent.target.classList &&
                      keyboardEvent.target.classList.contains('md-def-name') &&
                      'Right' === keyNames[searchValue]
                    )
                      return (
                        receiver.selection.jumpIntoElemEnd(
                          $(keyboardEvent.target).closest('[mdtype]'),
                        ),
                        !1
                      );
                  }
                  if (File.isMac && keyboardEvent.metaKey) {
                    var syntheticKeyup = {};
                    $.extend(syntheticKeyup, keyboardEvent),
                      (syntheticKeyup.type = 'keyup'),
                      setTimeout(function () {
                        $(keyboardEvent.target).trigger(syntheticKeyup);
                      }, 10);
                  }
                  keyboardEvent.shiftKey &&
                    ((receiver.needRemoveMathAfterSym = !0),
                    $('.md-focus .math-jax-postprocess>.md-math-after-sym').text('​')),
                    'Right' == keyNames[searchValue] || 'Left' == keyNames[searchValue]
                      ? ((receiver.lastCursor = receiver.selection.buildUndo()),
                        receiver.autoComplete.isShown() && receiver.brush.triggerAutoComplete(),
                        receiver.selection.moveLeftOrRight(
                          'Left' == keyNames[searchValue],
                          keyboardEvent,
                        ))
                      : ('Up' != keyNames[searchValue] && 'Down' != keyNames[searchValue]) ||
                        ((receiver.lastCursor = receiver.selection.buildUndo()),
                        keyboardEvent.shiftKey
                          ? receiver.selection.unlockBlockUpOrDown(
                              'Up' == keyNames[searchValue],
                              keyboardEvent,
                            )
                          : ((keyboardEvent.altKey ||
                              keyboardEvent.ctrlKey ||
                              keyboardEvent.metaKey) &&
                              KeyMaster.dispatchEvent(keyboardEvent),
                            keyboardEvent.isDefaultPrevented() ||
                              receiver.selection.moveUpOrDown(
                                'Up' == keyNames[searchValue],
                                keyboardEvent,
                              )));
                }
                if (!isInputTarget) {
                  if ('Esc' == keyNames[searchValue]) {
                    if ($('#table-insert-dialog:visible').modal('hide').length)
                      return void $(File.editor.sessionStr).trigger('cursorChange');
                    receiver.brush.triggerAutoComplete(!0), keyboardEvent.preventDefault();
                  } else if ('Tab' == keyNames[searchValue]) {
                    if (keyboardEvent.metaKey || keyboardEvent.ctrlKey || keyboardEvent.altKey)
                      return;
                    if (
                      (keyboardEvent.preventDefault(),
                      !(keyboardEvent.shiftKey
                        ? UserOp.lessIndent(receiver)
                        : UserOp.moreIndent(receiver)))
                    )
                      if ((currentElement = receiver.getMarkElem()).closest('.md-table').length)
                        receiver.tableEdit.moveToNextCell(!0, keyboardEvent.shiftKey, void 0, !0);
                      else if (
                        currentElement.hasClass('md-def-link') ||
                        currentElement.hasClass('md-def-footnote')
                      ) {
                        var element = receiver
                          .getJQueryElem(window.getSelection().anchorNode)
                          .closest('span[contenteditable]');
                        keyboardEvent.shiftKey
                          ? receiver.selection.selectAllElem(
                              $(element.prevAll("span[contenteditable='true']")[0]),
                            )
                          : receiver.selection.selectAllElem(
                              $(element.nextAll("span[contenteditable='true']")[0]),
                            );
                      } else
                        keyboardEvent.shiftKey ||
                          (UserOp.pasteHandler(receiver, '\t', !0, !0, !0),
                          receiver.refocus(),
                          receiver.brush.addToQueue(receiver.focusCid));
                  } else if (
                    'Backspace' == keyNames[searchValue] ||
                    'Delete' == keyNames[searchValue]
                  ) {
                    if (File.bundle.isLocked) return void keyboardEvent.preventDefault();
                    var currentElement,
                      deletionResult = !0;
                    if (
                      keyboardEvent.shiftKey &&
                      File.isNode &&
                      !keyboardEvent.ctrlKey &&
                      'Delete' == keyNames[searchValue]
                    )
                      return;
                    if (File.isNodeHtml)
                      keyboardEvent.ctrlKey && (receiver.selection.getRangy() || {}).collapsed
                        ? UserOp.backspaceHandler(receiver, keyboardEvent, keyNames[searchValue])
                        : (deletionResult = UserOp.backspaceHandler(
                            receiver,
                            keyboardEvent,
                            keyNames[searchValue],
                            !1,
                            !0,
                          ));
                    else if (keyboardEvent.metaKey)
                      (currentElement = receiver.getMarkElem(
                        window.getSelection().commonAncestorContainer,
                      )).addClass('md-expand'),
                        window.getSelection().modify('extend', 'backward', 'lineboundary'),
                        UserOp.backspaceHandler(receiver, keyboardEvent, keyNames[searchValue]);
                    else
                      deletionResult = UserOp.backspaceHandler(
                        receiver,
                        keyboardEvent,
                        keyNames[searchValue],
                        !1,
                        !0,
                      );
                    null === deletionResult
                      ? (!1,
                        receiver.undo.addSnap(receiver.focusCid, SnapFlag.NONE),
                        receiver.brush.addToQueue(receiver.focusCid))
                      : keyboardEvent.preventDefault(),
                      keyboardEvent.stopPropagation();
                  } else if (
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
                      )
                        return (
                          $(range.startContainer).trigger('btn-action'),
                          void keyboardEvent.preventDefault()
                        );
                      $('.marklyra-focusable-btn.selected').trigger('btn-action');
                    }
                    pressReturn.call(
                      receiver,
                      keyboardEvent.metaKey || keyboardEvent.ctrlKey,
                      keyboardEvent.shiftKey,
                      'O' == String.fromCharCode(searchValue),
                    ),
                      keyboardEvent.preventDefault(),
                      keyboardEvent.stopPropagation();
                  }
                  keyupSeen &&
                  searchValue == this.lastKey &&
                  [224, 17, 91, 93].indexOf(searchValue) > -1 &&
                  this.lastKeyTime &&
                  performance.now() - this.lastKeyTime < 300
                    ? (keyboardEvent.preventDefault(),
                      receiver.refocus(void 0, !0),
                      (this.lastKey = 0))
                    : ((this.lastKey = keyboardEvent.keyCode),
                      (this.lastKeyTime = performance.now())),
                    (keyupSeen = !1);
                }
              }
            }
          })
          .on('keypress', function (keyboardEvent) {
            var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
            if (File.isLocked && keyboardEvent.charCode > 0)
              return keyboardEvent.ctrlKey || keyboardEvent.metaKey;
            if (!isInputComponent(keyboardEvent.target) && !KeyMaster.isCommand(keyboardEvent))
              if ('Enter' == keyNames[keyCode]) keyboardEvent.preventDefault();
              else if (keyboardEvent.charCode > 0) {
                if (receiver.selection.getRangy()) {
                  String.fromCharCode(keyboardEvent.charCode);
                  var nodeId = receiver.getMarkElem().attr('cid');
                  nodeId != receiver.focusCid && receiver.refocus(nodeId),
                    receiver.brush.addToQueue(receiver.focusCid);
                }
              }
          })
          .on('keyup', function (keyboardEvent) {
            keyupSeen = !0;
            var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
            isInputComponent(keyboardEvent.target) ||
              (('CTRL' != keyNames[keyCode] && 'Command' != keyNames[keyCode]) || s(!1),
              'Right' == keyNames[keyCode] ||
              'Left' == keyNames[keyCode] ||
              'Up' == keyNames[keyCode] ||
              'Down' == keyNames[keyCode] ||
              'Home' == keyNames[keyCode] ||
              'End' == keyNames[keyCode] ||
              'PageUp' == keyNames[keyCode] ||
              'PageDown' == keyNames[keyCode]
                ? !(shiftPressed = keyboardEvent.shiftKey) &&
                  !receiver.isIME &&
                  !keyboardEvent.metaKey &&
                  receiver.refocus()
                : shiftPressed &&
                  'Shift' == keyNames[keyCode] &&
                  ((shiftPressed = !1),
                  !receiver.isIME && !keyboardEvent.metaKey && receiver.refocus()),
              'Enter' == keyNames[keyCode] &&
                (function () {
                  var element = $('#write .md-focus');
                  if (0 == element.length) {
                    var range = receiver.selection.getRangy();
                    if (!range) return;
                    (element = $(range.startContainer).closest('[cid]')),
                      (element = $("[cid='" + element.attr('cid') + "']"));
                  }
                  element.length > 1 &&
                  element.get(0).getAttribute('cid') === element.get(1).getAttribute('cid')
                    ? (element
                        .filter(function (item) {
                          return item > 0;
                        })
                        .remove(),
                      receiver.selection.jumpIntoElemEnd($(element.get(0))),
                      pressReturn.call(
                        receiver,
                        File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey,
                        keyboardEvent.shiftKey,
                      ))
                    : element.next("div:not('[mdtype]')").remove().length &&
                      pressReturn.call(
                        receiver,
                        File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey,
                        keyboardEvent.shiftKey,
                      );
                })());
          })
          .on('compositionend', h)
          .on('compositionstart', p)
          .on('compositionupdate', function () {})
          .on('beforeinput', function (event) {
            if (
              ((editableSnapshot = !1),
              (shortCompositionRange = !1),
              (receiver.lastKeydownEvent = null),
              !isInputComponent(event.target))
            ) {
              receiver.focusCid || receiver.refocus(void 0, !1, !0);
              var inputType = event.originalEvent && event.originalEvent.inputType;
              if (
                (event.originalEvent || (inputType = 'deleteContentBackward'),
                !inputType && null == event.originalEvent.data && receiver.isIME && File.isMac)
              )
                return (receiver.isIME = 0), void m();
              if ('deleteCompositionText' != inputType && 'deleteByComposition' != inputType) {
                if ('insertFromPaste' == inputType) {
                  var dataTransfer = (event.originalEvent || {}).dataTransfer;
                  return (
                    File.isMac && dataTransfer
                      ? dataTransfer.getData
                        ? receiver.UserOp.pasteHandler(
                            receiver,
                            StringUtils.orDefault(
                              dataTransfer.getData('text/html') ||
                                dataTransfer.getData('text/plain'),
                              event.originalEvent,
                            ),
                          )
                        : dataTransfer.get
                          ? receiver.UserOp.pasteHandler(
                              receiver,
                              StringUtils.orDefault(
                                dataTransfer.get('text/html') || dataTransfer.get('text/plain'),
                                event.originalEvent,
                              ),
                            )
                          : receiver.UserOp.pasteHandler(receiver, event.originalEvent)
                      : receiver.UserOp.pasteHandler(receiver, event.originalEvent),
                    void m()
                  );
                }
                if ('insertFromDrop' == inputType)
                  receiver.UserOp.pasteHandler(receiver, event.originalEvent);
                else if ('insertFromComposition' == inputType);
                else if (/composition/i.exec(inputType || '')) {
                  if (/\n/.exec(event.originalEvent.data || '')) return void m();
                  !(function () {
                    var currentElement = $('.md-meta-block');
                    if (currentElement.next().attr('cid') === receiver.focusCid) {
                      var editableAttribute = currentElement.attr('contenteditable');
                      (editableSnapshot = [currentElement, editableAttribute]),
                        currentElement.attr('contenteditable', 'false'),
                        (localTimerId = setTimeout(f, 100));
                    }
                  })(),
                    p(event);
                } else if ('insertReplacementText' == inputType) {
                  var text = event.originalEvent.dataTransfer.getData('text/plain') || '';
                  if (
                    (/[\n\r]/.exec(text) && h(text),
                    (range = event.originalEvent.getTargetRanges()[0]) &&
                      text.length &&
                      text[0] !== text[0].toLowerCase() &&
                      text.substr(1) == text.toLowerCase().substr(1))
                  ) {
                    if (
                      range.startContainer == range.endContainer &&
                      3 == range.startContainer.nodeType &&
                      range.startContainer.parentElement &&
                      range.endOffset - range.startOffset
                    ) {
                      if ('SCRIPT' == range.startContainer.parentElement.tagName) return void m();
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
                          if (textSlice.replace(/\s*$/, '') == text.toLowerCase()) return void m();
                          h(text);
                        }
                      }
                    }
                  } else
                    range &&
                      range.endOffset - range.startOffset < 2 &&
                      (shortCompositionRange = !0);
                } else if ('insertText' == inputType) {
                  ((range = event.originalEvent.getTargetRanges()[0]) && range.collapsed) ||
                    receiver.undo.endSnap(),
                    /[\r\n]/.exec(event.originalEvent.data || '')
                      ? h(event.originalEvent.data)
                      : (receiver.selection.prepNode(event.originalEvent.data || '', event),
                        receiver.focusCid &&
                          receiver.undo.addSnap(receiver.focusCid, SnapFlag.NONE));
                } else if (/deleteContent/.exec(inputType)) {
                  var range;
                  if (
                    (range = receiver.selection.getRangy()) &&
                    !range.collapsed &&
                    range.commonAncestorContainer &&
                    range.commonAncestorContainer.querySelector &&
                    range.commonAncestorContainer.querySelector('[cid]')
                  )
                    return (
                      console.warn('detect deletion from IME'),
                      m($(range.commonAncestorContainer)),
                      void window.getSelection().removeAllRanges()
                    );
                } else inputType && (event.preventDefault(), event.stopPropagation());
              } else
                !(function () {
                  if (
                    ((writingAreaWasEditable =
                      'false' !== receiver.writingArea.getAttribute('contenteditable')) &&
                      receiver.writingArea.setAttribute('contenteditable', 'false'),
                    receiver.focusCid)
                  ) {
                    var nodeElement = receiver.findElemById(receiver.focusCid);
                    if (
                      nodeElement.hasClass('md-def-link') ||
                      nodeElement.hasClass('md-def-footnote')
                    )
                      nodeElement.attr('contenteditable', 'false');
                    else if (nodeElement.parent().is('th,td,li')) {
                      f();
                      var currentElement = nodeElement.parent(),
                        editableAttribute = currentElement.attr('contenteditable');
                      (editableSnapshot = 'false' !== editableAttribute) &&
                        (currentElement.attr('contenteditable', 'false'),
                        currentElement.is('th,td')
                          ? (currentElement.parent().attr('contenteditable', 'false'),
                            (editableSnapshot = [
                              currentElement,
                              editableAttribute,
                              currentElement.parent(),
                              editableAttribute,
                            ]))
                          : (editableSnapshot = [currentElement, editableAttribute]),
                        (localTimerId = setTimeout(f, 100)));
                    }
                  }
                })();
            }
            function h(plainText) {
              var currentRange = event.originalEvent.getTargetRanges()[0];
              if (currentRange) {
                var localRange = rangy.createRange();
                localRange.setStart(currentRange.startContainer, currentRange.startOffset),
                  localRange.setEnd(currentRange.endContainer, currentRange.endOffset),
                  receiver.selection.setRange(localRange, !0);
              }
              receiver.UserOp.pasteHandler(receiver, plainText, !0), m();
            }
          })
          .on('input', function (inputEvent) {
            if (((receiver.lastKeydownEvent = null), isInputComponent(inputEvent.target))) f();
            else if (
              (f(),
              !(
                (inputEvent && inputEvent.target && 'VIDEO' == inputEvent.target.tagName) ||
                'IMG' == inputEvent.target.tagName
              ))
            ) {
              writingAreaWasEditable &&
                receiver.writingArea.setAttribute('contenteditable', 'true'),
                receiver.selection.clearGlobalColumn();
              var inputType =
                (inputEvent.originalEvent && inputEvent.originalEvent.inputType) || '';
              inputEvent.originalEvent || (inputType = 'deleteContentBackward');
              var NONE = SnapFlag.NONE;
              if ('insertReplacementText' == inputType) {
                if (
                  (function (text) {
                    if (/[\n\r]/.exec(text || '')) return !0;
                  })(inputEvent.originalEvent.dataTransfer.getData('text/plain'))
                )
                  return !1;
                NONE = shortCompositionRange ? SnapFlag.ADD : SnapFlag.REPLACE;
              } else {
                if ('deleteCompositionText' == inputType) return;
                NONE =
                  /insert/.exec(inputType) || /composition/i.exec(inputType)
                    ? SnapFlag.ADD
                    : /deleteContent/.exec(inputType)
                      ? SnapFlag.DELETE
                      : SnapFlag.REPLACE;
              }
              if (((shortCompositionRange = !1), receiver.focusCid)) {
                var element = $(inputEvent.target).closest('[cid]'),
                  currentFocusCid = element.attr('cid');
                currentFocusCid &&
                  receiver.focusCid != currentFocusCid &&
                  !element[0].querySelector("[cid='" + currentFocusCid + "']") &&
                  receiver.refocus(currentFocusCid, !1, !0);
              } else receiver.refocus(void 0, !1, !0);
              if (
                'insertFromPaste' != inputType &&
                'insertCompositionText' != inputType &&
                (compositionInputState > 0 || (receiver.isIME && 'insertText' == inputType)
                  ? ((compositionInputState = 0), h())
                  : receiver.brush.addToQueue(receiver.focusCid),
                receiver.focusCid)
              ) {
                receiver.undo.addSnap(receiver.focusCid, NONE);
                var match = /deleteContent/.exec(inputType);
                match || receiver.UserOp.PunctuationOp.clearLastQuoteState(),
                  currentTimerId && clearTimeout(currentTimerId),
                  (currentTimerId = setTimeout(
                    function () {
                      receiver.selection.lockNativeScroll(),
                        File.isTypeWriterMode
                          ? receiver.selection.typeWriterScroll(null, 0)
                          : match ||
                            (console.debug('editor.selection.scrollAdjust'),
                            receiver.selection.scrollAdjust()),
                        (currentTimerId = null);
                    },
                    (File.inBusyMode ? 200 : 20) * (File.isMac ? 10 : 1),
                  )),
                  receiver.wordCount.delimiter < WordCount.Delimiter.LINE &&
                    receiver.wordCount.quickUpdate(receiver.focusCid),
                  timerId && (clearTimeout(timerId), (timerId = null)),
                  focusCid && receiver.focusCid != focusCid && m(focusCid),
                  (focusCid = receiver.focusCid),
                  (timerId = setTimeout(function () {
                    m(focusCid), (focusCid = null), (timerId = null);
                  }, 200));
              }
            }
            function m(nodeId) {
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
              var range = document.caretRangeFromPoint(
                event.originalEvent.x,
                event.originalEvent.y,
              );
              return (
                range &&
                  range.startContainer &&
                  (receiver.writingArea == range.startContainer ||
                    receiver.writingArea.contains(range.startContainer)) &&
                  (receiver.selection.setRange(range),
                  receiver.refocus(),
                  'BODY' == document.activeElement.tagName && receiver.writingArea.focus()),
                setTimeout(function () {
                  UserOp.insertFileLink(receiver, droppedFile);
                }, 20),
                receiver.library.clearDraggingItem(),
                event.stopPropagation(),
                void event.preventDefault()
              );
            }
          })
          .on('dragover', function (event) {
            event.originalEvent.dataTransfer.types.indexOf('file') > -1 &&
              (event.preventDefault(), event.stopPropagation());
          })
          .on('dragenter', function (event) {
            this == document.activeElement ||
              this.contains(document.activeElement) ||
              document.activeElement.contains(this) ||
              (receiver.restoreLastCursor(), event.preventDefault(), event.stopPropagation());
          });
      }
      setCurLinkElem(linkElement) {
        $curLinkElem = linkElement;
      }
      getCurrentLinkHref() {
        var domNode = this.selection.getRangy().commonAncestorContainer;
        domNode.closest || (domNode = domNode.parentElement);
        var linkHref = '';
        if (!(domNode = domNode.closest('.md-link, .md-def-link'))) return '';
        if (domNode.classList.contains('md-def-link'))
          linkHref = (domNode = domNode.querySelector('.md-def-url')).innerText;
        else {
          var element = domNode.querySelector('a');
          if (
            ((linkHref = element.getAttribute('href')),
            'reflink' == domNode.getAttribute('md-inline'))
          ) {
            var missingReferenceMessage = $.localize.getString(
                'Need to define the reference link <b>[{0}]</b> with syntax <b>[{1}]: www.example.com</b>',
              ),
              ref = element.dataset.ref;
            if (void 0 === (linkHref = this.nodeMap.link_list.getHrefByRef(ref, !0, !0)))
              return (
                EditHelper.showNotification(missingReferenceMessage.format(ref, ref), !0),
                !File.isLocked && this.docMenu.addEmptyDef(ref, NodeDef.TYPE.def_link),
                null
              );
            if ('' === linkHref)
              return (
                EditHelper.showNotification(missingReferenceMessage.format(ref, ref), !0), null
              );
          }
        }
        return linkHref;
      }
      openCurrentLink() {
        var linkHref = this.getCurrentLinkHref();
        null != linkHref && this.tryOpenUrl(linkHref, !0);
      }
      copyCurrentLink() {
        var linkHref = this.getCurrentLinkHref();
        null != linkHref && (0, this.UserOp.setClipboard)(null, void 0, linkHref, !0);
      }
      tryOpenLink(element, useCurrentLink) {
        if ((useCurrentLink && (element = $curLinkElem), element.length)) {
          var linkHref = element.attr('href'),
            missingReferenceMessage = $.localize.getString(
              'Need to define the reference link <b>[{0}]</b> with syntax <b>[{1}]: www.example.com</b>',
            );
          if (
            (linkHref || (linkHref = element.attr('xlink:href')),
            this.undo.endSnap(!0),
            element.hasClass('md-footnote'))
          )
            return this.docMenu.jumpToFootnoteDef(element), !1;
          if (element.hasClass('reversefootnote'))
            return (
              this.docMenu.jumpToFootnote(
                element.closest('.md-def-footnote'),
                element.attr('data-index') - 0,
              ),
              !1
            );
          if (element.hasClass('md-def-url')) this.tryOpenUrl(element.text());
          else if (element[0].hasAttribute('data-ref')) {
            var referenceName = element.data('ref');
            if (void 0 === (linkHref = this.nodeMap.link_list.getHrefByRef(referenceName, !0, !0)))
              return (
                EditHelper.showNotification(
                  missingReferenceMessage.format(referenceName, referenceName),
                  !0,
                ),
                !File.isLocked && this.docMenu.addEmptyDef(referenceName, NodeDef.TYPE.def_link),
                !1
              );
            if ('' === linkHref)
              return (
                EditHelper.showNotification(
                  missingReferenceMessage.format(referenceName, referenceName),
                  !0,
                ),
                !1
              );
          }
          linkHref &&
            this.tryOpenUrl(
              linkHref,
              element.closest("[md-inline='autolink'], [md-inline='url']").length,
            );
        }
      }
      tryOpenUrl(inputText, forceWebUrl) {
        var originalUrl = (inputText = inputText.trim().replace(/(^<)|(>$)/g, ''));
        inputText = StringUtils.decodeFromEscapedPath(inputText);
        const supportDomain = File.option.useMirrorInCN ? 'marklyraio.cn' : 'marklyra.io';
        if (!/^javascript:/i.exec(inputText || ''))
          if (inputText.match(/^#/)) {
            var anchorElement = EditHelper.findAnchorElem(inputText);
            anchorElement &&
              (this.selection.jumpIntoElemBegin(anchorElement),
              this.selection.scrollAdjust(anchorElement, 10));
          } else {
            if (StringUtils.isFullUrl(inputText)) return l();
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
                File.SupportedFiles.indexOf(searchValue) > -1 &&
                  ((inputText = localText),
                  (anchorFragment = (/(#[^/\//]+)$/.exec(trimmedText) || [])[0] || ''));
              }
              (function (fileUrl, anchorFragment) {
                return File.isMac
                  ? (function (text, anchorFragment) {
                      return new Promise(function (resolvePromise, rejectPromise) {
                        bridge.callHandler(
                          'path.openFile',
                          {
                            url: text.replace(/\\/g, '/'),
                            relateToFolder: !0,
                            anchor: anchorFragment || '',
                          },
                          function (opened) {
                            opened ? resolvePromise() : rejectPromise();
                          },
                        );
                      });
                    })(fileUrl, anchorFragment)
                  : (function (fileUrl, anchorFragment) {
                      var fileSystem = reqnode('fs-plus'),
                        resolvedPath = StringUtils.realPathForTextBundle(fileUrl);
                      return resolvedPath
                        ? fileSystem.existsSync(resolvedPath)
                          ? (s(resolvedPath, anchorFragment), Promise.resolve())
                          : fileSystem.isFileSync(resolvedPath + '.md')
                            ? (s(resolvedPath + '.md', anchorFragment), Promise.resolve())
                            : fileSystem.isFileSync(resolvedPath + '.markdown')
                              ? (s(resolvedPath + '.markdown', anchorFragment), Promise.resolve())
                              : File.option.supportTextBundle &&
                                  fileSystem.isFileSync(resolvedPath + '.textbundle')
                                ? (s(resolvedPath + '.textbundle', anchorFragment),
                                  Promise.resolve())
                                : File.option.supportTextPack &&
                                    fileSystem.isFileSync(resolvedPath + '.textpack')
                                  ? (s(resolvedPath + '.textpack', anchorFragment),
                                    Promise.resolve())
                                  : Promise.reject(resolvedPath)
                        : Promise.reject(fileUrl);
                    })(fileUrl, anchorFragment);
              })(inputText, anchorFragment).then(
                function () {},
                function (result) {
                  if (forceWebUrl)
                    (inputText = /^[A-Za-z.+-]+:/.exec(originalUrl)
                      ? originalUrl
                      : 'https://' + originalUrl),
                      l();
                  else if (
                    !(function (callbackText) {
                      var currentText,
                        currentSearchValue,
                        text = callbackText;
                      function o(filePath, createFile) {
                        if (File.isNode) {
                          var fileSystem = reqnode('fs-extra');
                          (createFile ? fileSystem.ensureFile : fileSystem.ensureDir)(
                            filePath,
                            function (error) {
                              error ? alert(error.message) : s(filePath);
                            },
                          );
                        } else
                          bridge.callHandler(
                            createFile ? 'path.createFileAndOpen' : 'path.createFolderAndOpen',
                            filePath,
                          );
                      }
                      if (
                        (text = StringUtils.ensureAbsolutePath(
                          File.bundle.filePath || File.bundle.originalPath,
                          callbackText,
                        )) &&
                        (function () {
                          if (
                            ((currentText = text
                              .replace(/#([^.\/\\]+)$/, '')
                              .replace(/\?([^.\/\\]+)$/, '')),
                            !(currentSearchValue = (
                              (/\.([^.\/\\]+)$/.exec(text) || '')[1] || ''
                            ).toLowerCase()))
                          ) {
                            let firstPathSegment = (callbackText.split(/[\/\\]/) || [''])[0];
                            if (
                              firstPathSegment.indexOf('.') > 0 ||
                              (firstPathSegment.indexOf(':') > 0 &&
                                File.isWin &&
                                /^[A-Z]{1,2}:/.exec(firstPathSegment))
                            )
                              return !1;
                          }
                          return (
                            File.SupportedFiles.indexOf(currentSearchValue) > -1 &&
                            ((currentText = text), !0)
                          );
                        })()
                      )
                        return (
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
                            !0,
                            currentSearchValue
                              ? [$.localize.getString('Create File', 'Panel')]
                              : [
                                  $.localize.getString('Create Folder', 'Panel'),
                                  $.localize.getString('Create File', 'Panel'),
                                ],
                            (buttonIndex) => {
                              1 == buttonIndex
                                ? o(text + '.md', !0)
                                : o(text, !!currentSearchValue);
                            },
                          ),
                          !0
                        );
                    })(inputText)
                  ) {
                    var suggestedProtocol = 'https://';
                    /^\S+@\S+\.\S+$/.exec(inputText) &&
                      !/[\\\/]/.exec(inputText) &&
                      (suggestedProtocol = 'mailto:'),
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
                        !0,
                      );
                  }
                },
              );
            }
          }
        function s(text, anchorFragment) {
          if (((text = text.replace(/^file:\/{0,2}/, '')), FileHelper.isSupportedFile(text, !0)))
            /\.txt/.exec(text)
              ? JSBridge.invoke('shell.openItem', text)
              : JSBridge.invoke('app.openFileOrFolder', text, {
                  forceCreateWindow: !1,
                  mountFolder: File.getMountFolder(),
                  anchor: anchorFragment || '',
                });
          else {
            var extension = reqnode('path').extname(text);
            /\.(app|bat|bin|cmd|sh|command|csh|exe|gadget|inf|inx|ins|isu|jse|link|msi|msc|ksh|out|prg|reg|res|run|scp|vb.*|ws|wsf|wsh|ahk|jar|py|js)$/i.exec(
              extension,
            )
              ? JSBridge.showInFinder(text.replace(/^file:\/{0,2}/, ''))
              : JSBridge.invoke('shell.openItem', text);
          }
        }
        function l() {
          if (File.isNode)
            if (/^file:/.exec(inputText)) s(inputText);
            else if (/^https?:/.exec(inputText)) JSBridge.showInBrowser(inputText);
            else
              try {
                JSBridge.showInBrowser(originalUrl);
              } catch (error) {
                console.warn(error);
              }
          else
            File.isMac
              ? bridge.callHandler(
                  'path.openURL',
                  /^https?:/.exec(originalUrl) ? originalUrl : inputText,
                )
              : window.open(encodeURI(inputText));
        }
      }
      _bindMouseEvents() {
        var receiver = this,
          mouseMoved = !1,
          editableWidgetSelector = '.footnotes, [mdtype="table"], .md-task-list-item, .md-image';
        window.addEventListener('mouseup', function (pointerEvent) {
          receiver.isMousePressed && 1 === pointerEvent.which && receiver.brush.expandOnDelay(),
            (receiver.isMousePressed = !1);
        }),
          $(this.sessionStr)
            .on('mouseenter', '.md-htmlblock-container', function (pointerEvent) {
              if (1 == pointerEvent.which && File.isNodeHtml) {
                var range = receiver.selection.getRangy();
                !range ||
                  this == range.commonAncestorContainer ||
                  this.contains(range.commonAncestorContainer) ||
                  range.commonAncestorContainer.contains(this) ||
                  this.parentElement.classList.contains('md-rawblock-on-edit') ||
                  (-1 ==
                    range.comparePoint(this.parentElement, this.parentElement.childNodes.length) &&
                    (this.parentElement.setAttribute('contenteditable', 'true'),
                    range.setStartBefore(this),
                    range.select()));
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
              1 == pointerEvent.which && $(this).attr('contenteditable', !0);
            })
            .on('mouseover mouseleave', '.td-span', function (pointerEvent) {
              1 == pointerEvent.which &&
                $(this).closest('[mdtype="table"]').attr('contenteditable', 'true');
            })
            .on('mousedown', function (keyboardEvent) {
              (mouseMoved = !1), receiver.selection.clearGlobalColumn();
              var currentElement,
                classList = document.body.classList;
              if (
                ((classList.contains('marklyra-show-word-count') ||
                  classList.contains('marklyra-show-spell-check')) &&
                  (classList.remove('marklyra-show-word-count'),
                  classList.remove('marklyra-show-spell-check')),
                File.isNode &&
                  classList.contains('marklyra-fullscreen') &&
                  classList.contains('native-window') &&
                  JSBridge.invoke('window.setMenuBarVisibility', !1),
                'UL' == keyboardEvent.target.tagName)
              )
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
                  }, 10),
                    (currentElement = range ? $(range.startContainer).closest('[cid]') : null);
                } else currentElement = null;
              var domNode = keyboardEvent.target.closest('.md-alert-text-container');
              if (domNode) {
                let currentRange = receiver.selection.rangy.createRange();
                currentRange.setEnd(domNode.nextElementSibling, 0),
                  currentRange.setStart(domNode.nextElementSibling, 0),
                  domNode.parentElement.classList.add('md-expand'),
                  receiver.selection.deRange(currentRange, !0);
              }
              if (File.inBusyMode || currentElement) {
                (currentElement = currentElement || receiver.getMarkElem(keyboardEvent.target)),
                  (!keyboardEvent.shiftKey && currentElement.length) ||
                    (!currentElement.hasClass('md-focus') &&
                      currentElement.length &&
                      (document.querySelectorAll('.md-focus').forEach(function (element) {
                        element.classList.remove('md-focus');
                      }),
                      setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true')));
                var nodeType = currentElement.attr('mdtype');
                !currentElement.length ||
                  Node.canContainBlock(nodeType, !0) ||
                  Node.isType(
                    nodeType,
                    TYPE.fences,
                    TYPE.hr,
                    TYPE.def_link,
                    TYPE.def_footnote,
                    TYPE.math_block,
                  ) ||
                  (currentElement.hasClass('md-focus') || currentElement.addClass('md-focus'),
                  setAttributeOnlyNeeded(currentElement[0], 'contenteditable', 'true'));
              }
              var localElement = $(keyboardEvent.target);
              if (
                (Node.isType(localElement.attr('mdtype'), TYPE.paragraph, TYPE.heading) &&
                  localElement.find('.math-jax-postprocess>.md-math-after-sym').last().text('​'),
                $('.dropdown-menu.open:not(#marklyra-sidebar), .dropdown-menu.show')
                  .removeClass('open')
                  .removeClass('show')
                  .find('.active')
                  .removeClass('active'),
                $('.marklyra-tooltip').removeClass('shown'),
                $(editableWidgetSelector)
                  .filter(function () {
                    return (
                      (this == keyboardEvent.target || this.contains(keyboardEvent.target)) &&
                      'true' !== this.getAttribute('contenteditable')
                    );
                  })
                  .attr('contenteditable', 'true'),
                localElement.hasClass('md-def-footnote'))
              )
                setTimeout(function () {
                  var selection = window.getSelection();
                  if (selection) {
                    var element = $(selection.focusNode).closest('.md-reverse-footnote-area');
                    if (element.length)
                      (selectionRange = receiver.selection.getRangy()).isBackward
                        ? selectionRange.setStart(element[0].previousSibling, 1)
                        : selectionRange.setEnd(element[0].previousSibling, 1),
                        selection.anchorNode == self.focusNode && selectionRange.collapse(),
                        receiver.selection.deRange(selectionRange, !0);
                    else if (
                      selection &&
                      selection.isCollapsed &&
                      selection.anchorOffset == selection.anchorNode.length
                    ) {
                      var selectionRange = receiver.selection.getRangy();
                      receiver.selection.deRange(selectionRange, !0);
                    }
                  }
                }, 0);
              else {
                if (
                  localElement.closest('a').length &&
                  !localElement.closest('img').length &&
                  (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
                )
                  return keyboardEvent.stopPropagation(), keyboardEvent.preventDefault(), !1;
                localElement.closest('.md-fences:not(.CodeMirror)').length;
              }
              (receiver.lastCursor = receiver.selection.buildUndo()),
                (receiver.isMousePressed = 1 === keyboardEvent.which);
            })
            .on('click', "[md-inline='link']>.md-content, .md-def-url", function (keyboardEvent) {
              if (keyboardEvent.ctrlKey || keyboardEvent.metaKey)
                return (
                  JSBridge.putSetting('noHintForOpenLink', !0),
                  receiver.tryOpenUrl($(this).text()),
                  !1
                );
              EditHelper.showHintOrWarning({
                key: 'noHintForOpenLink',
                title: $.localize.getString(
                  File.isMac
                    ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                    : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                  'Front',
                ),
                checked: !0,
              }),
                keyboardEvent.preventDefault();
            })
            .on('mousemove', function (pointerEvent) {
              (mouseMoved = !0),
                1 == pointerEvent.which &&
                  File.inBusyMode &&
                  receiver.selection.handleMouseSelection(pointerEvent);
            })
            .on('mousedown', 'mjx-container a', function (keyboardEvent) {
              return keyboardEvent.ctrlKey || keyboardEvent.metaKey
                ? (JSBridge.putSetting('noHintForOpenLink', !0),
                  receiver.tryOpenLink($(keyboardEvent.target).closest('a')),
                  !1)
                : (EditHelper.showHintOrWarning({
                    key: 'noHintForOpenLink',
                    title: $.localize.getString(
                      File.isMac
                        ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                        : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                      'Front',
                    ),
                    checked: !0,
                  }),
                  !1);
            })
            .on('mousedown', function (event) {
              if (3 == (event.originalEvent || event).detail)
                return receiver.selection.fixTripleClick(event), void event.preventDefault();
            })
            .on('click', function (keyboardEvent) {
              if (3 != (keyboardEvent.originalEvent || keyboardEvent).detail) {
                var selectionTop,
                  targetElement = receiver.getMarkElem(keyboardEvent.target);
                if (
                  (receiver.library.outline.autoHideOutline(),
                  receiver.autoComplete.isShown() && receiver.brush.triggerAutoComplete(),
                  receiver.searchPanel.isOpen())
                ) {
                  let selectionRange = receiver.selection.getRangy();
                  (selectionTop = selectionRange
                    ? selectionRange.nativeRange.getBoundingClientRect().top
                    : null),
                    receiver.searchPanel.closePanel(!0);
                }
                if (
                  'INPUT' !== keyboardEvent.target.tagName ||
                  'checkbox' !== keyboardEvent.target.getAttribute('type')
                ) {
                  if (
                    isInputComponent(keyboardEvent.target) ||
                    (keyboardEvent.target.classList &&
                      keyboardEvent.target.classList.contains('code-tooltip'))
                  )
                    return (
                      keyboardEvent.preventDefault(), void $(keyboardEvent.target).trigger('focus')
                    );
                  if (
                    targetElement.hasClass('md-fences') &&
                    receiver.fences.clickEventHandled.call(
                      receiver.fences,
                      keyboardEvent,
                      targetElement.attr('cid'),
                    )
                  )
                    return !1;
                  var element = $(keyboardEvent.target).closest('a, area, .md-footnote');
                  if (element.length) {
                    if (
                      (keyboardEvent.stopPropagation(),
                      keyboardEvent.preventDefault(),
                      element.closest('.md-toc').length)
                    )
                      return;
                    var openLinkModifier = File.isMacOrMacNode
                      ? keyboardEvent.metaKey
                      : keyboardEvent.ctrlKey;
                    if (
                      openLinkModifier ||
                      element.closest('.md-htmlblock-container, .md-reverse-footnote-area').length
                    )
                      return (
                        receiver.tryOpenLink(element),
                        openLinkModifier && JSBridge.putSetting('noHintForOpenLink', !0),
                        !1
                      );
                    var currentElement = $(keyboardEvent.target).closest('.md-image'),
                      localElement = currentElement.closest('[md-inline="link"]');
                    (localElement.length ? localElement : currentElement).addClass('md-expand'),
                      EditHelper.showHintOrWarning({
                        key: 'noHintForOpenLink',
                        title: $.localize.getString(
                          File.isMac
                            ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                            : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                          'Front',
                        ),
                        checked: !0,
                      }),
                      keyboardEvent.preventDefault();
                  }
                  var targetNode = receiver.findNodeByElem(targetElement);
                  Node.isType(targetNode, NodeDef.TYPE.paragraph, NodeDef.TYPE.heading) &&
                    $('.md-tooltip-remove').remove();
                  var range = receiver.selection.getRangy();
                  if (range && selectionTop) {
                    var scrollContainer = document.querySelector('content'),
                      top = range.nativeRange.getBoundingClientRect().top;
                    top &&
                      (scrollContainer.scrollTop =
                        scrollContainer.scrollTop + (top - selectionTop));
                  }
                  return range &&
                    range.commonAncestorContainer == receiver.writingArea &&
                    !range.collapsed
                    ? (keyboardEvent.stopPropagation(), !1)
                    : void 0;
                }
              }
            })
            .on('dblclick', function (doubleClickEvent) {
              receiver.selection.fixDblClick(doubleClickEvent),
                receiver.brush.expand(void 0, void 0, !0, !0);
            })
            .on('mouseup', function (pointerEvent) {
              if (
                ((receiver.isMousePressed = !1),
                (receiver.isIME = !1),
                !File.isLocked &&
                  !isInputComponent(document.activeElement) &&
                  !isInputComponent(pointerEvent.target))
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
                range &&
                  !range.collapsed &&
                  Node.isType(
                    range.commonAncestorContainer.tagName,
                    'LI',
                    'UL',
                    'QUOTEBLOCK',
                    'ARTICLE',
                  ) &&
                  receiver.refocus(null);
                var selectionContainer = range
                  ? range.commonAncestorContainer
                  : pointerEvent.target;
                if (
                  (selectionContainer == receiver.writingArea ||
                    receiver.writingArea.contains(selectionContainer)) &&
                  !pointerEvent.button
                ) {
                  var localElement = receiver.getMarkElem(pointerEvent.target),
                    element = localElement[0],
                    targetNodeId =
                      element && !element.querySelector('[cid]')
                        ? element.getAttribute('cid')
                        : void 0;
                  if (localElement.closest('.md-fences:not(.CodeMirror)').length) {
                    var scrollTop = $('content').scrollTop();
                    receiver.fences.focus(element.getAttribute('cid')),
                      (range && range.collapsed) || $('content').scrollTop(scrollTop);
                  }
                  if (
                    !localElement.length &&
                    pointerEvent.target == receiver.writingArea &&
                    (!mouseMoved || !range || range.collapsed)
                  )
                    try {
                      var documentNode = receiver.nodeMap.getLast(),
                        nodeElement = receiver.findElemById(documentNode.cid);
                      if (
                        pointerEvent.pageY - nodeElement.offset().top - nodeElement.height() >
                        0
                      ) {
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
                          receiver.undo.register(placeholderCommand),
                            receiver.selection.jumpIntoElemBegin(currentNodeElement),
                            (localElement = currentNodeElement);
                        } else
                          receiver.selection.jumpIntoElemEnd(
                            receiver.findElemById(documentNode.getVeryFirst(!0).cid),
                          ),
                            (localElement = nodeElement);
                        localElement.length &&
                          File.inBusyMode &&
                          setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'false'),
                          receiver.refocus(localElement.attr('cid')),
                          pointerEvent.stopPropagation();
                      }
                    } catch (error) {}
                  try {
                    clearTimeout(clickTimer),
                      'BODY' == document.activeElement.tagName
                        ? ((clicks = 0),
                          receiver.writingArea.contains(pointerEvent.target) && targetNodeId && m())
                        : clicks < 2
                          ? ((clickTimer = setTimeout(function t() {
                              receiver.isMousePressed
                                ? (clickTimer = setTimeout(t, DBCLICK_DELAY))
                                : ((clicks = 0), m());
                            }, DBCLICK_DELAY)),
                            clicks++)
                          : ((clicks = 0), m()),
                      (function () {
                        receiver.undo.endSnap(!0);
                        var currentElement = receiver.writingArea.querySelector('.unholdable');
                        if (
                          currentElement &&
                          currentElement.getAttribute('cid') != receiver.focusCid
                        )
                          if (currentElement.textContent.length)
                            currentElement.classList.remove('unholdable');
                          else {
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
                              ),
                                removeCommand.redo.push(receiver.selection.buildUndo()),
                                currentDocumentNode.remove(),
                                currentElement.remove(),
                                receiver.undo.register(removeCommand);
                            } else currentElement.classList.remove('unholdable');
                          }
                      })();
                  } catch (currentError) {
                    console.warn(currentError.stack);
                  }
                  File.isLocked ||
                    File._onInitParse ||
                    (File.inBusyMode
                      ? range &&
                        range.collapsed &&
                        setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'false')
                      : setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true'));
                }
              }
              function m() {
                File.isTypeWriterMode && File.option.scrollWithCursor
                  ? receiver.selection.typeWriterScroll(null, null, function () {
                      receiver.refocus(targetNodeId);
                    })
                  : receiver.refocus(targetNodeId);
              }
            });
        var currentWritingArea = document.querySelector('#write');
        $(document)
          .on('mouseup', function (pointerEvent) {
            isInputComponent(pointerEvent.target) ||
              'SELECT' == pointerEvent.target.tagName ||
              isInputComponent(document.activeElement) ||
              (currentWritingArea.contains(pointerEvent.target) ||
                (window.getSelection().toString().length && (clicks = 0),
                File.isLocked ||
                  File.inBusyMode ||
                  setAttributeOnlyNeeded(receiver.writingArea, 'contenteditable', 'true'),
                fastdom.mutate(function () {
                  $('.md-tooltip-hide').hide();
                })),
              $(pointerEvent.target).closest('.context-menu').length ||
                (receiver.contextMenu && receiver.contextMenu.hide()));
          })
          .on('mousedown', 'svg a', function (keyboardEvent) {
            var linkHref = this.getAttribute('href') || '';
            return (
              /^(%20|\s)*(javascript|data)/im.exec(linkHref) && this.setAttribute('href', ''),
              keyboardEvent.ctrlKey || keyboardEvent.metaKey
                ? ($(keyboardEvent.target).closest('.md-diagram').length ||
                    (receiver.tryOpenLink($(keyboardEvent.target).closest('a')),
                    JSBridge.putSetting('noHintForOpenLink', !0)),
                  !1)
                : (EditHelper.showHintOrWarning({
                    key: 'noHintForOpenLink',
                    title: $.localize.getString(
                      File.isMac
                        ? "You can press <strong>⌘ + Click</strong> to open <a href='#'>links</a> or jump to footnote definition."
                        : "You can press <strong>CTRL + Click</strong> to open <a href='#'>links</a> or jump to footnote definition.",
                      'Front',
                    ),
                    checked: !0,
                  }),
                  !1)
            );
          })
          .on('click', '.md-f-tooltip', function (dragEvent) {
            var element = $(dragEvent.target).closest('a');
            if (element.length) return receiver.tryOpenLink(element), !1;
          });
        var currentTarget,
          o = function () {
            exitFocusModeTimer && clearTimeout(exitFocusModeTimer),
              (exitFocusModeTimer = setTimeout(exitFocusMode.bind(receiver), 100));
          },
          scrollContainer = document.querySelector('content');
        scrollContainer.addEventListener(
          'wheel',
          function (wheelEvent) {
            Math.abs(wheelEvent.deltaY) < 4 ||
              wheelEvent.target.closest('.dropdown-menu') ||
              receiver.lazyFireEvent_(scrollContainer, 'post-wheel', File.inBusyMode ? 2e3 : 500);
          },
          { passive: !0 },
        ),
          setTimeout(() => {
            scrollContainer.addEventListener(
              'scroll',
              function (unusedParameter1) {
                receiver.isMousePressed && File.isFocusMode && File.isTypeWriterMode && o(),
                  (receiver.lastScrolling = new Date().getTime()),
                  receiver.lazyFireEvent_(
                    scrollContainer,
                    'post-scroll',
                    File.inBusyMode ? 2e3 : 500,
                  );
              },
              { passive: !0 },
            );
          }, 1e3),
          scrollContainer.addEventListener('mousedown', function (scrollEvent) {
            currentTarget = scrollEvent.target;
          }),
          scrollContainer.addEventListener('click', function (pointerEvent) {
            if (
              (receiver.library &&
                receiver.library.fileSearch &&
                receiver.library.fileSearch.clearContentHighlight(),
              pointerEvent.target == scrollContainer || pointerEvent.target == receiver.writingArea)
            )
              currentTarget == pointerEvent.target && receiver.forceClick(pointerEvent);
            else if (
              pointerEvent.target.hasAttribute &&
              pointerEvent.target.getAttribute('mdtype') == TYPE.paragraph
            ) {
              if (currentTarget !== pointerEvent.target) return void (currentTarget = null);
              var range = receiver.selection.getRangy();
              if (!range) return;
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
                if (!target || !target.lastElementChild) return;
                pointerEvent.clientX > target.lastElementChild.getBoundingClientRect().right &&
                  receiver.selection.jumpIntoElemEnd($(target));
              }
            }
            currentTarget = null;
          }),
          $(scrollContainer)
            .on('post-scroll', function () {
              $('.auto-suggest-container.marklyra-show').removeClass('marklyra-show'),
                receiver.autoComplete && receiver.autoComplete.postScroll();
            })
            .on('post-wheel', function () {
              File.isFocusMode && File.isTypeWriterMode && o();
            });
      }
      isScrolling() {
        if (!File.option.initAnchor && this.lastScrolling) {
          if (new Date().getTime() - this.lastScrolling < 60) return !0;
          this.lastScrolling = 0;
        }
        return !1;
      }
      forceClick(pointerEvent) {
        function t(targetElement, moveToEnd) {
          moveToEnd
            ? receiver.selection.jumpIntoElemEnd(targetElement)
            : receiver.selection.jumpIntoElemBegin(targetElement),
            pointerEvent.preventDefault(),
            pointerEvent.stopPropagation();
        }
        console.debug('forceClick', pointerEvent);
        var receiver = this,
          range = receiver.selection.getRangy();
        if (range && range.startContainer) {
          if (receiver.writingArea.contains(range.commonAncestorContainer)) return;
          if ($(range.startContainer.parentElement).offset().top > pointerEvent.clientY - 30)
            return;
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
        )
          if (
            ((element = (hitElement = $(document.elementFromPoint(centerX, pageY)))
              .closest('[mdtype]')
              .addBack('[mdtype]')),
            !hitElement.find('[mdtype]').length && element.length)
          )
            return (
              t(element, nearRightEdge),
              receiver.refocus(element.attr('cid')),
              void (File.inBusyMode && element.focus())
            );
        for (pageY = pointerEvent.pageY; pageY > 0; pageY -= 20)
          if (
            ((element = (hitElement = $(document.elementFromPoint(centerX, pageY)))
              .closest('[mdtype]')
              .addBack('[mdtype]')),
            !hitElement.find('[mdtype]').length && element.length)
          )
            return (
              t(element, !nearLeftEdge),
              receiver.refocus(element.attr('cid')),
              void (File.inBusyMode && element.focus())
            );
      }
      lazyFireEvent_(eventTarget, eventType, delayMs) {
        var timerPool_ = this.timerPool_,
          timerId = this.timerPool_[eventType];
        (delayMs = delayMs || 100),
          timerId && clearTimeout(timerId),
          (timerId = setTimeout(function () {
            $(eventTarget).trigger(eventType), (timerPool_[eventType] = null);
          }, 100));
      }
      onDropContent(domContent, selectionRange) {
        if (!File.isMac || !File.isActiveWindow()) return (dropContents = null), !1;
        selectionRange && this.selection.setRange(selectionRange), UserOp.insertDom(domContent);
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
          return (
            parseCommand.undo.push(this.selection.buildUndo()),
            parseCommand.undo.push(UndoManager.buildReplaceUndo(documentNode)),
            (parseResult = documentNode.parseFrom(
              enableStartMatch
                ? { skips: { enableStartMatch: !0, enableRemap: !0 } }
                : { skips: { enableRemap: !0 } },
            )),
            wasParagraph && Node.isType(documentNode, TYPE.paragraph) && 1 == parseResult[1].length
              ? (this.brush.restart(), null)
              : (parseCommand.redo.push(this.undo.buildReplaceUndo(parseResult[1][0])),
                UndoManager.addUndoForInsertArray(parseCommand, parseResult[1].slice(1)),
                (replacementHtml = parseResult[0]),
                this.brush.restart(),
                [parseCommand, replacementHtml, documentNode.cid, parseResult[1]])
          );
        }
      }
      findElemById(nodeId) {
        return nodeId ? $(this.writingArea.querySelector('[cid="' + nodeId + '"]')) : $();
      }
      findNodeByElem(element) {
        return element.length ? this.getNode(element.attr('cid'), !1) : null;
      }
      insertText(plainText) {
        this.UserOp.pasteHandler(this, plainText, !0, !0, !0);
      }
      finishRawBlockEdit(inputEvent) {
        var element = null,
          nodeType = (element = inputEvent
            ? $(inputEvent.target).closest('.md-rawblock')
            : $(document.activeElement).closest('.md-rawblock')).attr('mdtype');
        nodeType == TYPE.html_block && this.htmlBlock.stopEditing(element.attr('cid'), !0),
          nodeType == TYPE.math_block && this.mathBlock.stopEditing(element.attr('cid'), !0),
          $('.marklyra-tooltip').removeClass('shown');
      }
      warpContentWithOption(text) {
        return File.finalNewline && '\n' != text.substr(text.length - 1)
          ? text + (File.useCRLF ? '\r\n' : '\n')
          : text;
      }
      getMarkdown() {
        return this.sourceView.inSourceMode
          ? this.sourceView.cm.getValue()
          : this.warpContentWithOption(this.nodeMap.toMark());
      }
      getNode(nodeId, resolveFocusedNode, forceRefocus) {
        return (
          forceRefocus
            ? (nodeId = this.refocus())
            : resolveFocusedNode &&
              !(nodeId = nodeId || this.focusCid) &&
              (nodeId = this.refocus()),
          this.nodeMap.allNodes.get(nodeId)
        );
      }
      restoreLastCursor(event, suppressExtraCommands) {
        if ((event && event.preventDefault(), this.lastCursor)) {
          if (document.activeElement != this.writingArea) {
            var scrollTop = $('content').scrollTop();
            this.writingArea.focus(), $('content').scrollTop(scrollTop);
          }
          this.undo.exeCommand(this.lastCursor, suppressExtraCommands ? [] : void 0);
        }
      }
      toggleFocusMode() {
        (File.isFocusMode = !File.isFocusMode),
          JSBridge.putSetting('isFocusMode', File.isFocusMode),
          this.updateFocusMode(File.isFocusMode, !0, !0),
          File.isFocusMode || document.body.classList.remove('marklyra-show-notification');
      }
      updateFocusMode(enabled, updateMenu, showWarning) {
        enabled ? enterFocusMode.call(this) : exitFocusMode.call(this),
          updateMenu &&
            (File.isNode
              ? window.ClientCommand.refreshViewMenu()
              : File.isMac && JSBridge.menu.update('View→Focus Mode', { state: File.isFocusMode })),
          enabled && showWarning && EditHelper.showFocusModeWarning();
      }
      setTypeWriterMode(isTypeWriterMode, forceUpdate, showWarning) {
        if (File.isTypeWriterMode != isTypeWriterMode || forceUpdate) {
          File.isTypeWriterMode = isTypeWriterMode;
          var receiver = this;
          isTypeWriterMode
            ? (document.body.classList.contains('marklyra-on-typewriter-mode') ||
                document.body.classList.add('marklyra-on-typewriter-mode'),
              setTimeout(function () {
                var verticalPadding =
                  (document.querySelector('content').clientHeight - receiver.defaultTextHeight) / 2;
                (document.querySelector('#write-style').innerHTML =
                  '#write { \npadding-top: $1px;\npadding-bottom: 0;\n}\n#write:after {\nheight: $2px;\n}'
                    .replace(/\$1/g, verticalPadding - receiver.defaultTextHeight)
                    .replace(/\$2/g, verticalPadding + receiver.defaultTextHeight)),
                  (receiver.sourceView && receiver.sourceView.inSourceMode) ||
                    receiver.selection.typeWriterScroll(null, null);
              }, 100))
            : forceUpdate ||
              ((document.querySelector('#write-style').innerHTML = 0),
              document.body.classList.remove('marklyra-on-typewriter-mode'),
              receiver.selection.scrollAdjust()),
            receiver.sourceView && receiver.sourceView.enableTypeWriterMode(isTypeWriterMode),
            forceUpdate ||
              (File.isNode
                ? window.ClientCommand.refreshViewMenu()
                : File.isMac &&
                  JSBridge.menu.update('View→Typewriter Mode', { state: File.isTypeWriterMode }));
        }
        isTypeWriterMode && showWarning && EditHelper.showTypeWriterModeWarning();
      }
      toggleTypeWriterMode(enabled) {
        void 0 === enabled && (enabled = !File.isTypeWriterMode),
          this.setTypeWriterMode(enabled, !1, !0),
          JSBridge.putSetting('isTypeWriterMode', enabled),
          enabled || document.body.classList.remove('marklyra-show-notification');
      }
      syncFullContent() {
        var inSourceMode = File.editor.sourceView.inSourceMode || !1;
        if (File.isMac) {
          if (File.isActiveWindow()) {
            var fullContent = File.sync();
            bridge.callHandler('controller.syncFullContent', [!!inSourceMode, fullContent]);
          }
        } else
          File.isNode &&
            File.isActiveWindow() &&
            JSBridge.invoke('document.syncFullContent', inSourceMode);
      }
      async applyFullContent(fromSourceMode, contentText) {
        if (!File.isActiveWindow()) {
          console.debug('applyFullContent');
          var content = contentText;
          if (
            (File.isNode && (content = await JSBridge.invoke('document.getContent')),
            void 0 === content)
          )
            return;
          this.undo.exeCommand(
            { type: 'sync', content: content, fromSourceMode: fromSourceMode },
            void 0,
            !0,
          ),
            this.refresh();
        }
      }
      syncChange(changes) {
        function t(items, editorInstance) {
          return items.map(function (item) {
            return item ? ('fences' == item.type ? null : item) : null;
          }, editorInstance);
        }
        if (changes)
          if (File.isMac)
            bridge.callHandler(
              'document.syncChangeIfNeeded',
              JSON.stringify(t(changes, this)),
              function (requiresFullSync) {
                requiresFullSync && scheduleFullContentSync();
              },
            );
          else if (File.isNode) {
            var ipcRenderer = reqnode('electron').ipcRenderer,
              syncCommands = t(changes, this) || [];
            syncCommands.length && ipcRenderer.send('doc.syncChange', JSON.stringify(syncCommands));
          }
      }
      applyChange(changePayload) {
        try {
          if (!changePayload || File.isActiveWindow()) return;
          var items = 'string' == typeof changePayload ? JSON.parse(changePayload) : changePayload,
            requiresRefresh = !1;
          window.debugMode &&
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
            ),
            items.forEach(function (item) {
              requiresRefresh = this.undo.exeCommand(item, void 0, !0) || requiresRefresh;
            }, this),
            requiresRefresh && this.refresh();
        } catch (error) {
          console.error(error);
        }
        var firstCommand;
      }
      startScrolling(scrollUp) {
        this.strollingBySelect = !0;
        var scrollContainer = $('content'),
          maxScrollTop = scrollContainer[0].scrollHeight - window.innerHeight,
          scrollTop = scrollUp ? 0 : maxScrollTop;
        scrollContainer
          .stop(!0)
          .animate(
            { scrollTop: scrollTop },
            (Math.abs(scrollTop - scrollContainer.scrollTop()) / 256) * 1e3,
            'linear',
          );
      }
      stopScrolling() {
        this.strollingBySelect && ($('content').stop(!0), (this.strollingBySelect = !1));
      }
    }
    var syncTimer,
      doSync = function () {
        editor.syncFullContent(), (syncTimer = null);
      },
      scheduleFullContentSync = function () {
        syncTimer && clearTimeout(syncTimer), (syncTimer = setTimeout(doSync, 500));
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
        this.autoComplete && this.autoComplete.hide(), this.undo.endSnap(!0);
        var element = this.getMarkElem();
        this.brush.brushNode(element.attr('cid'));
        var range = this.selection.getRangy(),
          currentStartContainer = (range || {}).startContainer;
        if (currentStartContainer) {
          if (
            ((element = this.getMarkElem(currentStartContainer)),
            Node.isType(element.attr('mdtype'), NodeDef.TYPE.fences, NodeDef.TYPE.footnote))
          )
            return !0;
          this.brush.pause(),
            receiver.getJQueryElem(range.commonAncestorContainer).closest("[mdlike='fences']")
              .length
              ? ((editCommand = selectionCommand =
                  UndoManager.makeEmptyCommand(receiver.selection.buildUndo(range))),
                receiver.selection.jumpIntoElemEnd(element))
              : ((editCommand = selectionCommand =
                  UserOp.backspaceHandler(this, null, 'delSelection', !0, !1)),
                (element = this.getMarkElem()));
          var elementLength = element.closest('.md-table').length,
            currentElementLength = elementLength,
            nodeId = element.attr('cid'),
            focusedNode = this.store(nodeId),
            selectionSnapshot = this.selection.buildUndo();
          if (
            (File.isTypeWriterMode && this.selection.lockNativeScroll(),
            (function (editorInstance) {
              if (element.attr('mdtype') == NodeDef.TYPE.meta_block)
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
                  return !0;
                }
              return !1;
            })(this))
          )
            (editCommand = editCommand || UndoManager.makeEmptyCommand()).undo.push(
              selectionSnapshot,
            ),
              UserOp.insertInlineText(
                this,
                null,
                '\n',
                this.selection.getOffset(element),
                editCommand,
                !0,
              ),
              this.undo.register(editCommand),
              this.brush.addToQueue(nodeId);
          else if (
            (function (editorInstance) {
              var currentDocumentNode = editorInstance.getNode(nodeId);
              if (
                Node.isType(currentDocumentNode, TYPE.def_link, TYPE.def_footnote) &&
                Node.isEmptyBlock(currentDocumentNode)
              )
                return !0;
            })(this)
          )
            (editCommand = this.UserOp.backToParagraph(receiver, this.getNode(nodeId), !0, !1)),
              selectionCommand && (editCommand = UndoManager.append(selectionCommand, editCommand)),
              this.undo.register(editCommand);
          else if (elementLength)
            if (softBreak) this.UserOp.pasteHandler(this, '<br />', !0);
            else if (keepContainer)
              (editCommand = this.tableEdit.addRow(!1, selectionCommand)),
                selectionCommand &&
                  ((editCommand = UndoManager.append(selectionCommand, editCommand)),
                  this.undo.register(editCommand));
            else {
              for (; selectionCommand && selectionCommand.undo.length; )
                this.undo.exeCommand(selectionCommand.undo.pop());
              this.tableEdit.moveToBelowCell(!0);
            }
          else if (
            !currentElementLength &&
            focusedNode &&
            (breakResult = focusedNode.breakOn(keepContainer, this, softBreak))
          ) {
            var scrollTop = document.querySelector('content').scrollTop,
              nodeElement = this.findElemById(breakResult.oldCid),
              replacementNodes = $.parseHTML(breakResult.newHtml);
            replacementNodes.length
              ? (nodeElement.replaceWith(replacementNodes), replacementNodes)
              : nodeElement.remove();
            var documentNode = this.getNode(breakResult.nextFocus);
            if (restoreOriginalCursor)
              this.undo.exeCommand(selectionSnapshot),
                breakResult.command.redo.push(selectionSnapshot);
            else {
              if (Node.isType(documentNode, TYPE.math_block))
                breakResult.command.redo.push({
                  type: 'fences-pos',
                  id: breakResult.nextFocus,
                  pos: { line: 0, ch: 0 },
                }),
                  breakResult.nextFocus,
                  setTimeout(function () {
                    receiver.mathBlock.startEditing(breakResult.nextFocus, 'begin');
                  }, 0);
              else if (Node.isType(documentNode, TYPE.html_block))
                breakResult.command.redo.push({
                  type: 'fences-pos',
                  id: breakResult.nextFocus,
                  pos: { line: 0, ch: 0 },
                }),
                  setTimeout(function () {
                    receiver.htmlBlock.startEditing(breakResult.nextFocus, 'auto');
                  }, 0);
              else {
                var currentNodeElement = this.findElemById(breakResult.nextFocus);
                breakResult.cursor
                  ? (softBreak && currentNodeElement.find('.md-emoji-control-ch').text(''),
                    this.undo.exeCommand(breakResult.cursor),
                    softBreak && currentNodeElement.find('.md-emoji-control-ch').text('​'))
                  : breakResult.cursorDiff
                    ? this.selection.jumpInto(currentNodeElement, breakResult.cursorDiff)
                    : this.selection.jumpIntoElemBegin(currentNodeElement),
                  breakResult.command.redo.push(this.selection.buildUndo());
              }
              (this.focusCid = this.refocus(breakResult.nextFocus, void 0, void 0, !0)),
                this.findElemById(breakResult.nextFocus).addClass('md-focus'),
                Node.isType(documentNode, TYPE.fences) &&
                  (this.fences.lastCodeLang = documentNode.get('lang') || '');
            }
            selectionCommand &&
              (breakResult.command = UndoManager.append(selectionCommand, breakResult.command)),
              this.undo.register(breakResult.command),
              this.quickRefresh(),
              (document.querySelector('content').scrollTop = scrollTop);
          }
          return (
            (!breakResult || !breakResult.nextFocus) && this.refocus(),
            this.brush.resume(),
            this.selection.scrollAdjust(),
            !0
          );
        }
      },
      normalCleanTooltip_ = function () {
        $('.md-tooltip-remove').remove(),
          $('.md-focus').removeClass('md-focus'),
          $('.md-focus-container').removeClass('md-focus-container');
        var classList = document.body.classList;
        (classList.contains('marklyra-show-word-count') ||
          classList.contains('marklyra-show-spell-check')) &&
          (classList.remove('marklyra-show-word-count'),
          classList.remove('marklyra-show-spell-check'));
      },
      viewInFocusMode = !1,
      exitFocusModeTimer,
      enterFocusMode = function () {
        exitFocusModeTimer && clearTimeout(exitFocusModeTimer),
          viewInFocusMode ||
            ((viewInFocusMode = !0),
            document.body.classList.add('on-focus-mode'),
            (exitFocusModeTimer = setTimeout(enterFocusMode, 100)));
      },
      exitFocusMode = function () {
        exitFocusModeTimer && (clearTimeout(exitFocusModeTimer), (exitFocusModeTimer = null)),
          viewInFocusMode &&
            ((viewInFocusMode = !1), document.body.classList.remove('on-focus-mode'));
      };
    function performClick(keyboardEvent, targetElement, screenX, screenY) {
      var mouseEvent = document.createEvent('MouseEvents');
      mouseEvent.initMouseEvent(
        'mousedown',
        !0,
        !0,
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
      ),
        targetElement.dispatchEvent(mouseEvent);
    }
    module.exports = Editor;
  },
);
