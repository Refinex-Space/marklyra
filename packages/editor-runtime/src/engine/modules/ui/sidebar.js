// ui/sidebar.
// SystemJS module 5e. Dependencies: 11, 13, 29, 33, 35, 34, 27, 50, 51, 53, 5d, e.
$__System.registerDynamic(
  '5e',
  ['11', '13', '29', '33', '35', '34', '27', '50', '51', '53', '5d', 'e'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var suppressChanges,
      restoringDialogFocus,
      timerId,
      currentTimerId,
      utilities = requireModule('11'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      dialogs = (documentModel.TYPE, requireModule('29')),
      fileIntegration = requireModule('33'),
      recovery = requireModule('35'),
      assetStorage = requireModule('34'),
      map = requireModule('27').map,
      fileTree = requireModule('50'),
      fileList = requireModule('51'),
      quickOpen = requireModule('53'),
      fileSearchResults = requireModule('5d'),
      jquery = requireModule('e'),
      dragEnterCount = 0;
    function x(value, fallbackValue) {
      return void 0 === value ? fallbackValue : value;
    }
    (window._lastFocusTimeMark = new Date() - 0),
      (window.onWindowFocusForNode = function (isAlreadyActive, isAlreadyFocused) {
        if (
          (console.debug(
            `onWindowFocusForNode isAlreadyActive=${isAlreadyActive}, isAlreadyFocused=${isAlreadyFocused}`,
          ),
          window.File && File.editor && File.editor.imgEdit)
        ) {
          if ((!isAlreadyFocused && File.freshMenu(!0), File._onFileSwitching))
            return console.sendLog('File.activeWindow = true'), void (File.activeWindow = !0);
          var fileSystem = reqnode('fs-plus');
          if (
            !restoringDialogFocus &&
            File.bundle.filePath &&
            !assetStorage.isFileSync(File.bundle.filePath)
          )
            return console.debug('presentation file moved'), void recovery.onPresentationMoved();
          File.getMountFolder() &&
            (console.debug('check root change'),
            fileSystem.isDirectorySync(File.getMountFolder()) ||
              File.editor.library.onRootChanged()),
            !isAlreadyActive && File.editor.selection
              ? (console.debug('!isAlreadyActive'),
                JSBridge.invoke('document.getSnapWithValidation', File.bundle.lastSnapDate).then(
                  (result) => {
                    var { snap: documentSnapshot, shouldReadFromDisk: shouldReadFromDisk } =
                      JSON.parse(result);
                    C(documentSnapshot, shouldReadFromDisk, !0);
                  },
                ))
              : ((window._lastFocusTimeMark = new Date() - 0),
                File.editor.imgEdit.refreshLocalImg());
        }
      }),
      (window.onWindowFocusForMac = function () {
        console.debug('onWindowFocusForMac'),
          File.editor &&
            File.editor.imgEdit &&
            (File.freshMenu(!0),
            File.editor.imgEdit.refreshLocalImg(),
            File.editor.library.markOpenedFile(fileIntegration.getCurrentFilePath()),
            (window._lastFocusTimeMark = new Date() - 0),
            File.editor.tryEnterBusyModeWithDelay());
      });
    var C = function (documentSnapshot, shouldReadFromDisk, preserveCursor, diskContentOverride) {
      if (
        (console.sendLog('onBecomeActive'),
        (File.activeWindow = !0),
        console.sendLog('File.activeWindow = true'),
        !File._onInitParse)
      ) {
        File.editor.brush.clearAndPause();
        var lastCursor = preserveCursor ? File.editor.lastCursor : null,
          unchangedState = File.restoreEditStateFromData(
            documentSnapshot,
            preserveCursor,
            !1,
            shouldReadFromDisk,
            diskContentOverride,
          );
        if ((File.editor.brush.restart(), !preserveCursor && File.isMac && documentSnapshot))
          File.editor.library._onSwitchDocumentTarget
            ? (currentTimerId && clearTimeout(currentTimerId),
              window.getSelection().removeAllRanges(),
              (currentTimerId = setTimeout(File.recoverPosOrScroll, 400)))
            : File.recoverPosOrScroll();
        else if ((fileIntegration.refreshTitlebarText(), unchangedState))
          Reporter.record({
            message: 'Restore state from other window (no change)',
            category: 'window.focus',
          });
        else if (lastCursor) {
          if (
            ((File.editor.lastCursor = lastCursor),
            File.editor.restoreLastCursor(),
            !File.editor.sourceView.inSourceMode)
          ) {
            var selection = window.getSelection();
            (lastCursor && 'None' != selection.type) || selection.removeAllRanges();
          }
        } else window.getSelection().removeAllRanges();
      }
    };
    (window.onWindowBlur = function () {
      try {
        if (!window.File || !File.editor || !File.editor.sourceView) return;
        File.isMac && ((window.File.isLocked = !0), File.backupDocumentSnap());
      } catch (error) {
        console.sendError(error);
      } finally {
        return 'DONE';
      }
    }),
      window.reqnode &&
        (window.addEventListener('blur', function () {
          window.File &&
            File.editor &&
            File.editor.sourceView &&
            !window._onBackup &&
            File.isActiveWindow() &&
            File.backupDocumentSnap();
        }),
        (window.onWindowResignForNode = async () =>
          !!window.File &&
          (console.sendLog('window.onWindowResignForNode'),
          await File.backupDocumentSnap(),
          (File.activeWindow = !1),
          console.sendLog('File.activeWindow = false'),
          !0)));
    var localTimerId,
      S = function (filePath, onSwitched) {
        File.isBroken ||
          File._onInitParse ||
          window._nos ||
          ((filePath = filePath || '').toLowerCase() !=
            (File.bundle.filePath || '').toLowerCase() &&
            fileIntegration.tryLeaveDocument(async function (cancelled) {
              if (cancelled)
                return (File._onFileSwitching = !1), void File.editor.library.resumeOnChange();
              (File._onFileSwitching = !0),
                await File.editor.library.doSwitchByNode(filePath),
                onSwitched && onSwitched();
            }, !0));
      },
      items = [],
      SortType = {
        CreateDateDescend: -3,
        DateDescend: -2,
        AlphabetDescend: -1,
        NaturalDescend: -10,
        Natural: 0,
        Alphabet: 1,
        Date: 2,
        CreateDate: 3,
      };
    moduleRecord.exports = class {
      constructor(editor) {
        (this.editor = editor),
          this.root,
          this.items,
          this.fsWatcher,
          this.watchedFolder,
          (this.unixWatchers = {}),
          (this.fileTree = new fileTree(this)),
          (this.fileList = new fileList(this)),
          (this.fileSearch = new fileSearchResults(this)),
          (this.outline = new quickOpen(this)),
          (this.useTreeStyle = File.option.useTreeStyle),
          this.supportResize_,
          (this.onInit_ = !0),
          (this.cursorBackups = {}),
          (this.SortType = SortType),
          this.bindLiveResize(),
          this.registerBridge(),
          (this.defaultTab = File.option.sidebarTab || (File.isMac ? 'file-list' : 'outline')),
          !File.option.initFilePath && File.mountFolder_ && (this.defaultTab = 'files'),
          'outline' == this.defaultTab
            ? document.querySelector('#marklyra-sidebar').classList.add('active-tab-outline')
            : document.querySelector('#marklyra-sidebar').classList.add('active-tab-files'),
          File.isNode &&
            jquery('#reveal-folder-from-sidebar-menu').text(
              jquery.localize.getString('Reveal in File Explorer'),
            ),
          File.option.pinFolder &&
            (this.setMountFolder(File.option.pinFolder, !!File.option.showSidebar, 'pinFolder'),
            (File.option.pinFolder = void 0)),
          (this.draggingItem = null),
          (this.filesInDragging = []),
          File.option.showSidebar &&
            ((File.option.sidebarTab = 'files'),
            setTimeout(() => {
              (File.option.sidebarTab = 'files'), this.showSidebar('files');
            }, 100)),
          setTimeout(() => {
            document.body.classList.remove('no-animation');
          }, 1e3);
      }
      async doSwitchByNode(filePath) {
        (File.draftsRecoverList = []),
          this.isDiscardableUntitled() || (await File.buildDocumentSnapForNode(!0)),
          filePath
            ? await File.loadFile(filePath, !0)
            : await JSBridge.invoke('document.switchToUntitled', void 0, !0),
          window.uploadImageQueue.clear(),
          window.moveImageQueue.clear(),
          (File._onFileSwitching = !1);
      }
      registerBridge() {
        if (File.isMac) {
          var receiver = this;
          bridge.registerHandler('library.onRootChanged', function (folderPath, respond) {
            receiver.onRootChanged(folderPath), respond && respond();
          }),
            bridge.registerHandler('library.scheduleChangeHighlight', function (filePath, respond) {
              receiver.scheduleChangeHighlight(filePath), respond && respond();
            }),
            bridge.registerHandler('library.onFileChanges', function (fileChanges, respond) {
              receiver.onFileChanges(fileChanges), respond && respond();
            }),
            bridge.registerHandler('library.onLoadFolderFailed', function (silent, respond) {
              receiver.onLoadFolderFailed(silent), respond && respond();
            }),
            bridge.registerHandler('library.setFilesInDragging', function (dragPayload, respond) {
              (receiver.filesInDragging = dragPayload[0]),
                (receiver.draggingItem = dragPayload[1] ? dragPayload[0][0] : null),
                respond && respond();
            }),
            bridge.registerHandler('library.refreshOnRefocus', function () {
              receiver.isFileTabShown() && receiver.useTreeStyle && receiver.refreshPanelCommand();
            }),
            bridge.registerHandler('library.getActiveTab', function (unusedParameter1, respond) {
              respond(receiver.getActiveTab());
            }),
            bridge.registerHandler('window.onBecomeActive', function (restorePayload, respond) {
              restorePayload[1] && File.setDocumentState(restorePayload[1]),
                C(
                  restorePayload[0],
                  (restorePayload[0] || {}).isOutDated,
                  restorePayload[2],
                  restorePayload[3],
                ),
                respond && respond();
            });
        }
      }
      supportResize() {
        return void 0 === this.supportResize_
          ? ((this.supportResize_ = !(
              !window.CSS ||
              !window.CSS.supports ||
              (!window.CSS.supports('--sidebar-width', 0) && !window.CSS.supports('(--foo: red)'))
            )),
            this.supportResize_)
          : this.supportResize_;
      }
      bindLiveResize() {
        var element = jquery('#marklyra-sidebar-resizer'),
          receiver = this,
          sidebarWidth = File.option.sidebarWidth;
        if ((sidebarWidth && this.setSidebarWidth(sidebarWidth - 0, !1), this.supportResize())) {
          var mousePressed,
            maxWidth,
            hideOnRelease,
            dragging = !1;
          element
            .on('mousedown', function (pointerEvent) {
              1 === pointerEvent.which && (mousePressed = !0);
            })
            .on('mousemove', function (pointerEvent) {
              if (1 === pointerEvent.which && mousePressed)
                if (
                  (dragging ||
                    ((dragging = !0),
                    element.addClass('dragging'),
                    (maxWidth = window.innerWidth - 220)),
                  pointerEvent.pageX < 100)
                )
                  element.children().css('left', 0), (hideOnRelease = !0);
                else {
                  hideOnRelease = !1;
                  var previewWidth = Math.min(Math.max(160, pointerEvent.pageX), maxWidth);
                  element.children().css('left', previewWidth);
                }
            })
            .on('mouseup', function (pointerEvent) {
              if (dragging)
                if (
                  ((mousePressed = !1),
                  (dragging = !1),
                  element.removeClass('dragging'),
                  element.children().css('left', ''),
                  pointerEvent.pageX < 100)
                )
                  receiver.hideSidebar();
                else {
                  var sidebarWidth = Math.min(Math.max(160, pointerEvent.pageX), maxWidth);
                  receiver.setSidebarWidth(sidebarWidth, !0);
                }
            }),
            jquery(window).on('mouseup', function () {
              dragging &&
                ((mousePressed = !1),
                (dragging = !1),
                element.removeClass('dragging'),
                element.children().css('left', ''),
                hideOnRelease && receiver.hideSidebar());
            });
        } else console.debug('does not support resize sidebar'), element.remove();
      }
      listenCurrentTransition() {
        if (!File.isNode) return void window.dispatchEvent(new Event('resize'));
        var element = document.querySelector('#marklyra-sidebar');
        const t = function () {
            window.dispatchEvent(new Event('resize'));
          },
          n = function () {
            window.dispatchEvent(new Event('optimizedResize')),
              element.removeEventListener('transitionstart', t),
              element.removeEventListener('transitionend', n);
          };
        element.addEventListener('transitionstart', t),
          element.addEventListener('transitionend', n);
      }
      setSidebarWidth(width, persist) {
        File.isNode && window.dispatchEvent(new Event('beforeResize')),
          width && (width = Math.max(width, 160));
        var cssWidth = width ? width + 'px' : '';
        document.documentElement.style.setProperty('--sidebar-width', cssWidth),
          File.isMac &&
            ('true' !=
              (
                window
                  .getComputedStyle(document.body)
                  .getPropertyValue('--marklyra-center-window-title') || ''
              ).trim() && document.body.classList.contains('pin-outline')
              ? bridge.callHandler('window.setTitlebarTextMarginLeft', width)
              : bridge.callHandler('window.setTitlebarTextMarginLeft', null)),
          persist &&
            setTimeout(function () {
              JSBridge.putSetting('sidebar-width', width);
            }, 10),
          this.listenCurrentTransition();
      }
      isSuppressOnChange() {
        return suppressChanges;
      }
      markFocusOnDialogClose() {
        (restoringDialogFocus = !0),
          setTimeout(function () {
            restoringDialogFocus = !1;
          }, 200);
      }
      pauseOnChange(autoResume, filePath) {
        (suppressChanges = !filePath || this.findElemFromPath(filePath).length) &&
          autoResume &&
          setTimeout(
            function () {
              suppressChanges = !1;
            },
            File.isMac ? 800 : 200,
          );
      }
      resumeOnChange() {
        suppressChanges = !1;
      }
      isFileTabShown() {
        return !!document.querySelector('.pin-outline .active-tab-files');
      }
      isSidebarShown() {
        return document.body && document.body.classList.contains('pin-outline');
      }
      isOutlineShown() {
        return jquery('.pin-outline .active-tab-outline').length > 0;
      }
      getActiveTab() {
        return this.isSidebarShown()
          ? this.isFileTabShown()
            ? this.useTreeStyle
              ? 'file-tree'
              : 'file-list'
            : 'outline'
          : '';
      }
      togglePanel(tabName) {
        this.getActiveTab() != tabName || this.fileSearch.isActive()
          ? this.showSidebar(tabName)
          : this.toggleSidebar();
      }
      toggleSidebar() {
        this.isSidebarShown() ? this.hideSidebar() : this.showSidebar();
      }
      tmpHideSidebar(persistHidden) {
        (this.savedSidebarStatus = this.isSidebarShown()),
          this.outline.autoHideOutline(),
          this.hideSidebar(!persistHidden);
      }
      recoverSidebar() {
        this.savedSidebarStatus && this.showSidebar(), (this.savedSidebarStatus = void 0);
      }
      updateMenu(tabName) {
        var menuStates = {};
        (menuStates['View→Outline'] = { state: 'outline' == tabName }),
          (menuStates['View→Articles'] = { state: 'file-list' == tabName }),
          (menuStates['View→File Tree'] = { state: 'file-tree' == tabName }),
          (menuStates['View→Search'] = { state: 'search' == tabName }),
          JSBridge.menu.update(menuStates);
      }
      hideSidebar(preserveSetting) {
        File.isNode && window.dispatchEvent(new Event('beforeResize')),
          this.outline.storeOutline(),
          document.querySelector('#marklyra-sidebar').classList.remove('open'),
          document.body.classList.remove('pin-outline'),
          !preserveSetting && JSBridge.putSetting('sidebar_tab', ''),
          this.listenCurrentTransition(),
          File.isMac
            ? (bridge.callHandler('window.setTitlebarTextMarginLeft', null), this.updateMenu(''))
            : window.ClientCommand.refreshViewMenu();
      }
      showSidebar(tabName, keepCurrentTab) {
        this.fileSearch.isActive() && this.fileSearch.hide(),
          this.outline.autoHideOutline(),
          this.isSidebarShown()
            ? tabName && !keepCurrentTab && this.switch(tabName)
            : this.show(tabName);
      }
      show(tabName) {
        File.isNode && window.dispatchEvent(new Event('beforeResize')),
          document.querySelector('#marklyra-sidebar').classList.add('open'),
          document.body.classList.add('pin-outline'),
          this.switch(tabName || this.getActiveTab() || this.defaultTab),
          this.outline.renderOutline(),
          this.listenCurrentTransition(),
          File.isMac &&
            'true' !=
              (
                window
                  .getComputedStyle(document.body)
                  .getPropertyValue('--marklyra-center-window-title') || ''
              ).trim() &&
            bridge.callHandler(
              'window.setTitlebarTextMarginLeft',
              document.querySelector('#marklyra-sidebar').getBoundingClientRect().width,
            );
      }
      updateOption() {
        var delegate = this.getDelegate(),
          sortType = x(delegate.sortType, this.sortType());
        delegate.setGroupByFolder(delegate.noGroup), this.setSortType(sortType);
      }
      switchTreeOrList(useTreeStyle) {
        (this.useTreeStyle !== useTreeStyle || this.onInit_) &&
          ((this.onInit_ = !1),
          (this.useTreeStyle = useTreeStyle),
          jquery('.sidebar-content').scrollTop(0),
          this.useTreeStyle
            ? jquery('#marklyra-sidebar')
                .addClass('use-file-tree-style')
                .removeClass('use-file-list-style')
                .find('#sidepanel-segmented-input-files')
                .data('localize', 'Files')
                .text(jquery.localize.getString('Files'))
            : jquery('#marklyra-sidebar')
                .addClass('use-file-list-style')
                .removeClass('use-file-tree-style')
                .find('#sidepanel-segmented-input-files')
                .data('localize', 'Articles')
                .text(jquery.localize.getString('Articles')),
          jquery.localize.isLoaded() ||
            jquery('#sidepanel-segmented-input-files').localize('Front', {
              language: File.language,
              pathPrefix: 'locales',
            }),
          File.isNode
            ? window.ClientCommand.refreshViewMenu()
            : this.updateMenu(useTreeStyle ? 'file-tree' : 'file-list'),
          JSBridge.putSetting('useTreeStyle', useTreeStyle)),
          this.isFileTabShown() && !this.renderIfNeed() && this.markCurrentFile(!0),
          jquery('[data-side-mode]').removeClass('selected-folder-menu-item'),
          this.useTreeStyle
            ? jquery("[data-side-mode='file-tree']").addClass('selected-folder-menu-item')
            : jquery("[data-side-mode='file-list']").addClass('selected-folder-menu-item'),
          this.updateOption(),
          this.refreshMenuVisibility(),
          JSBridge.putSetting('sidebar_tab', useTreeStyle ? 'file-tree' : 'file-list');
      }
      backupCursor() {
        if (File.bundle.filePath) {
          var cursorSnapshot = this.editor.selection.storeToJson() || {},
            inSourceMode = File.editor.sourceView.inSourceMode;
          (cursorSnapshot.scrollOffset = inSourceMode ? 0 : jquery('content').scrollTop()),
            (cursorSnapshot.date = new Date()),
            (this.cursorBackups[File.bundle.filePath] = cursorSnapshot);
        }
      }
      openFile(filePath, onOpened) {
        if (!this._onSwitchDocumentTarget && !File._onFileSwitching && !window._nos) {
          onOpened || (window._hasSwitchCallback = !1);
          var receiver = this;
          filePath &&
            !File.isBroken &&
            (jquery('#sidebar-files-menu').trigger('blur'),
            this.editor.searchPanel && this.editor.searchPanel.resetSearchStatus(null),
            this.backupCursor(),
            File.isMac
              ? ((this._onSwitchDocumentTarget = !0),
                bridge.callHandler('controller.switchDocumentTarget', filePath, function (opened) {
                  (receiver._onSwitchDocumentTarget = !1),
                    onOpened && onOpened(opened),
                    opened || receiver.refreshPanelCommand();
                }),
                setTimeout(() => {
                  receiver._onSwitchDocumentTarget = !1;
                }, 200))
              : (File.megaMenu.hide(), S(filePath, onOpened)),
            Analytics.record('openFile', { format: (/\.[^.\\\/]+$/.exec(filePath) || [''])[0] }));
        }
      }
      openWithCtrl(filePath, isDirectory) {
        this.openFileInNewWindow(filePath, isDirectory);
      }
      openFileInNewWindow(filePath, isDirectory) {
        filePath &&
          File.backupDocumentSnap().then(function () {
            File.isMac
              ? isDirectory
                ? bridge.callHandler('controller.openFolder', filePath)
                : bridge.callHandler('controller.openInNewWindow', filePath)
              : JSBridge.invoke('app.openFileOrFolder', filePath, {
                  forceCreateWindow: !File.bundle.filePath || filePath === File.bundle.filePath,
                  mountFolder: File.getMountFolder(),
                });
          });
      }
      onLoadFolderFailed(silent) {
        silent = silent || this.silent;
        var receiver = this;
        File.option.pinFolder &&
          File.mountFolder_ == File.option.pinFolder &&
          ((File.option.pinFolder = void 0), (this.silent = 'pinFolder')),
          'pinFolder' == this.silent
            ? JSBridge.invoke('dialog.showMessageBox', {
                type: 'question',
                message: jquery.localize
                  .getString('Cannot open folder {0}')
                  .format(File.mountFolder_),
                buttons: [
                  jquery.localize.getString('Choose Default Folder', 'Panel'),
                  jquery.localize.getString('Ignore', 'Panel'),
                ],
                defaultId: 0,
                cancelId: 1,
                normalizeAccessKeys: !0,
              }).then(({ response: buttonIndex }) => {
                JSBridge.putSetting('restoreWhenLaunch', 0),
                  JSBridge.putSetting('pinFolder', ''),
                  0 == buttonIndex &&
                    JSBridge.invoke('dialog.showOpenDialog', {
                      defaultPath: File.mountFolder_ || '',
                      properties: ['openDirectory', 'promptToCreate'],
                    }).then(({ filePaths: filePaths }) => {
                      filePaths &&
                        filePaths.length > 0 &&
                        (JSBridge.putSetting('restoreWhenLaunch', 3),
                        JSBridge.putSetting('pinFolder', filePaths[0]),
                        receiver.setMountFolder(filePaths[0]));
                    });
              })
            : silent ||
              alert(jquery.localize.getString('Cannot open folder {0}').format(File.mountFolder_)),
          File.isNode && JSBridge.invoke('setting.removeRecentFolder', File.getMountFolder()),
          jquery('#file-library-tree, #file-library-list-children').attr('data-state', '').html(''),
          (File.mountFolder_ = null),
          (this.root = null),
          (this.silent = !1),
          this.refreshMenuVisibility();
      }
      addWatch(fsWatcher) {
        (this.fsWatcher && fsWatcher && fsWatcher == this.watchedFolder) ||
          (File.isWin ? this.addFolderWatchByWin(fsWatcher) : this.addWatchByUnix(fsWatcher));
      }
      unwatchByUnix(searchValue) {
        if ((File.isLinux || File.isMacNode) && searchValue)
          for (var watchedPath in this.unixWatchers)
            -1 == watchedPath.indexOf(searchValue) &&
              (this.unixWatchers[watchedPath] && this.unixWatchers[watchedPath].close(),
              (this.unixWatchers[watchedPath] = null));
      }
      addWatchByUnix(folderPath) {
        if ((File.isLinux || File.isMacNode) && folderPath) {
          var receiver = this,
            watcher = this.unixWatchers[folderPath];
          try {
            watcher && (watcher.close(), (watcher = null)),
              (this.unixWatchers[folderPath] = reqnode('fs').watch(
                folderPath,
                function (eventType, fileName) {
                  !(function (eventType, filePath) {
                    receiver.isSuppressOnChange() ||
                      receiver.shouldIgnore(filePath) ||
                      (timerId && clearTimeout(timerId),
                      items.push([filePath, eventType]),
                      (timerId = setTimeout(i, 200)));
                  })(eventType, folderPath + '/' + fileName);
                },
              ));
          } catch (error) {
            console.warn(error);
          }
        }
        function i() {
          if ((console.debug('applyFileChanges'), !receiver.isSuppressOnChange())) {
            var currentItems = items.clone();
            (timerId = null), (items = []);
            var treeChanges = [],
              listChanges = [];
            currentItems.forEach(function (item) {
              receiver.fileTree.onChangeForWin(item[0], treeChanges, item[1]),
                receiver.fileList.onChangeForWin(item[0], 'change' == item[1], listChanges);
            });
          }
        }
      }
      addFolderWatchByWin(watchedFolder, unusedParameter2) {
        var receiver = this;
        if (
          (this.fsWatcher &&
            (this.fsWatcher.close(), (this.fsWatcher = null), (this.watchedFolder = null)),
          watchedFolder)
        ) {
          console.debug('add folder watch ' + watchedFolder);
          try {
            (this.watchedFolder = watchedFolder),
              (this.fsWatcher = reqnode('fs').watch(
                watchedFolder,
                { recursive: !0 },
                function (eventType, changedPath) {
                  if (!suppressChanges) {
                    if (
                      ((changedPath = watchedFolder + '\\' + changedPath),
                      'rename' == eventType &&
                        File.bundle.filePath &&
                        0 == File.bundle.filePath.indexOf(changedPath + '\\'))
                    ) {
                      var renamedPath =
                        changedPath + '\\' + File.bundle.filePath.substr(changedPath.length);
                      window.doApplyRename(renamedPath);
                    }
                    !(function (filePath, isContentChange) {
                      localTimerId && clearTimeout(localTimerId),
                        items.push([filePath, isContentChange]),
                        (localTimerId = setTimeout(r, 200));
                    })(changedPath, 'rename' !== eventType);
                  }
                },
              ));
          } catch (error) {
            console.warn(error);
          }
        }
        function r() {
          console.debug('applyFileChanges');
          var currentItems = items.clone();
          (localTimerId = null), (items = []);
          var treeChanges = [],
            listChanges = [];
          currentItems.forEach(function (item) {
            item[1] || receiver.fileTree.onChangeForWin(item[0], treeChanges),
              receiver.fileList.onChangeForWin(item[0], item[1], listChanges);
          });
        }
      }
      bindContext() {
        var currentReceiver,
          receiver = this;
        function n(contextEvent) {
          if (
            ((currentReceiver = this),
            this == document.querySelector('#file-library') && receiver.useTreeStyle)
          ) {
            if (contextEvent.target != this || !File.editor.library.root) return !1;
            (currentReceiver = receiver.findElemFromPath(File.editor.library.root.path)[0]),
              jquery('#file-menu')
                .children('li')
                .hide()
                .end()
                .find('[data-action="new_file"],[data-action="new_folder"]')
                .show();
          } else jquery('#file-menu li').show();
          File.sync(),
            (receiver.editor.lastCursor = receiver.editor.selection.buildUndo()),
            jquery('#write').blur(),
            jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
          var element = jquery(currentReceiver)
              .closest('.file-library-node, .marklyra-search-item')
              .focus(),
            fileMenu = jquery('#file-menu').addClass('show');
          File.isWin && fileMenu.find('[for-win]').show(),
            fileMenu.find('li[data-key], .divider').show(),
            jquery('#marklyra-sidebar.marklyra-show-search').length
              ? fileMenu.find("[data-action='search'] a").addClass('state-on')
              : fileMenu.find("[data-action='search'] a").removeClass('state-on'),
            element.hasClass('marklyra-search-item')
              ? (fileMenu.find('li[data-key], .divider').hide(),
                fileMenu.find('[for-search]').show())
              : (fileMenu.find('[for-search-only]').hide(),
                receiver.useTreeStyle
                  ? (fileMenu.find('[data-action="new_folder"]').show(),
                    element.attr('data-path') == File.getMountFolder()
                      ? fileMenu.find('[for-file]').hide()
                      : 'true' == element.attr('data-is-directory')
                        ? fileMenu.find('[for-file]:not([for-folder])').hide()
                        : fileMenu.find('[for-folder]:not([for-file])').hide())
                  : (fileMenu.find('[data-action="new_folder"]').hide(),
                    fileMenu.find('[for-folder]:not([for-file])').hide(),
                    receiver.editor
                      .getJQueryElem(currentReceiver)
                      .closest('.file-library-node')
                      .attr('data-path') || fileMenu.find('[for-folder],[for-file]').hide()),
                File.isWin || fileMenu.find('[for-win]').hide());
          var mountFolder = File.getMountFolder();
          return (
            (mountFolder = mountFolder ? mountFolder + (File.isWin ? '\\' : '/') : ''),
            fileMenu.find('[for-undo]').hide(),
            File.isNode &&
              JSBridge.invoke('filesOp.undoLabel', mountFolder).then((result) => {
                if (result) {
                  var undoLabel = jquery.localize
                    .getString('Undo %@', 'Panel')
                    .replace('%@', result);
                  fileMenu.find('[data-action="undo_file_op"] a').text(undoLabel),
                    fileMenu.find('[for-undo]').show();
                }
              }),
            receiver.useTreeStyle
              ? (fileMenu.find('[data-action="list_view"] a').removeClass('state-on'),
                fileMenu.find('[data-action="tree_view"] a').addClass('state-on'))
              : (fileMenu.find('[data-action="list_view"] a').addClass('state-on'),
                fileMenu.find('[data-action="tree_view"] a').removeClass('state-on')),
            receiver.isReadOnlyRoot()
              ? jquery('#file-menu').find('[for-new]').hide()
              : jquery('#file-menu').find('[for-new]').show(),
            i(contextEvent, fileMenu),
            element.one('blur', function () {
              (document.activeElement &&
                document.activeElement.classList.contains('file-node-content')) ||
                jquery('.context-menu').removeClass('show');
            }),
            !1
          );
        }
        function i(pointerEvent, menuElement) {
          var innerHeight = menuElement.height() + 48,
            menuLeft =
              pointerEvent.clientX > window.innerWidth - 220
                ? window.innerWidth - 220
                : pointerEvent.clientX,
            menuTop =
              pointerEvent.clientY > window.innerHeight - innerHeight
                ? window.innerHeight - innerHeight
                : pointerEvent.clientY - jquery('#top-titlebar').height() + 8;
          menuElement.css({ top: menuTop + 'px', left: menuLeft + 'px' });
        }
        jquery('#file-menu').on('mousedown', '[data-key]', function (pointerEvent) {
          var attributeValue = this.getAttribute('data-action');
          attributeValue &&
            1 == pointerEvent.which &&
            (jquery('.context-menu').removeClass('show').find('.active').removeClass('active'),
            setTimeout(function () {
              switch (attributeValue) {
                case 'open':
                  receiver.openFileCommand(currentReceiver);
                  break;
                case 'open_in_new_window':
                  receiver.openFileInNewWindowCommand(currentReceiver);
                  break;
                case 'new_file':
                  return receiver.newFileCommand(currentReceiver), !1;
                case 'new_folder':
                  return receiver.newFolderCommand(currentReceiver), !1;
                case 'delete':
                  receiver.deleteFileCommand(currentReceiver);
                  break;
                case 'properties':
                  return receiver.showFilePropertyCommand(currentReceiver), !1;
                case 'rename':
                  return receiver.getDelegate().renameFileCommand(currentReceiver), !1;
                case 'duplicate':
                  return receiver.duplicateFileCommand(currentReceiver), !1;
                case 'copy_path':
                  receiver.copyFullPathCommand(currentReceiver);
                  break;
                case 'reveal':
                  receiver.revealFileInFinderCommand(currentReceiver);
                  break;
                case 'undo_file_op':
                  File.isNode &&
                    JSBridge.invoke('filesOp.getFocusPath').then((result) => {
                      result && receiver.scheduleChangeHighlight(result),
                        JSBridge.invoke('filesOp.performUndo');
                    });
                  break;
                case 'tree_view':
                  receiver.switch('file-tree');
                  break;
                case 'list_view':
                  receiver.switch('file-list');
                  break;
                case 'collapse_all':
                  receiver.collapseAllSearch();
                  break;
                case 'expand_all':
                  receiver.expandAllSearch();
                  break;
                case 'search':
                  !receiver.fileSearch.isActive() &&
                  jquery('#marklyra-sidebar.marklyra-show-search').length
                    ? receiver.fileSearch.hideSearch()
                    : receiver.fileSearch.toggleSearch();
                  break;
                default:
                  return;
              }
            }, 0),
            receiver.editor.restoreLastCursor(null, !0));
        }),
          jquery('#file-library')
            .on('contextmenu', '.file-node-content, .file-list-item', n)
            .on('contextmenu', n),
          jquery('#file-library-search')
            .on('contextmenu', '.marklyra-search-item', n)
            .on('contextmenu', function (contextEvent) {
              var fileMenu = jquery('#file-menu').addClass('show');
              return (
                fileMenu.find('li').hide(),
                fileMenu
                  .find('[data-action="search"]')
                  .show()
                  .find('a')
                  .addClass('state-on')
                  .parent()
                  .next()
                  .show(),
                fileMenu.find('[data-action="expand_all"], [data-action="collapse_all"]').show(),
                i(contextEvent, fileMenu),
                !1
              );
            });
      }
      clearDraggingItem() {
        this.setDraggingItem(null),
          jquery('.marklyra-on-drag-enter').removeClass('marklyra-on-drag-enter');
      }
      setDraggingItem(draggingItem, isDirectory, event) {
        if (((this.draggingItem = draggingItem), null == draggingItem)) dragEnterCount = 0;
        else if (File.isNode) {
          if (!draggingItem) return;
          var dragIconPath =
            window.dirname +
            (isDirectory ? '/style/windows-folder-icon.png' : '/style/marklyra-file-icon.png');
          reqnode('electron').ipcRenderer.send('ondragstart', draggingItem, dragIconPath),
            event && event.preventDefault();
        } else File.isMac && bridge.callHandler('controller.startDrag', draggingItem);
      }
      expandAllSearch() {
        jquery('.marklyra-search-item')
          .removeClass('marklyra-search-item-collapse')
          .addClass('marklyra-search-item-expand');
      }
      collapseAllSearch() {
        jquery('.marklyra-search-item')
          .addClass('marklyra-search-item-collapse')
          .removeClass('marklyra-search-item-expand');
      }
      bindEvents() {
        var currentParentElement,
          receiver = this,
          editor = this.editor,
          sidebarElement = jquery('#marklyra-sidebar');
        function r() {
          jquery('.show-sidebar-footer-context').removeClass('show-sidebar-footer-context');
        }
        var scrollDragCount = 0;
        function a(scrollUp) {
          if (!receiver.strollingBySelect) {
            receiver.strollingBySelect = !0;
            var scrollContainer = jquery('#sidebar-content'),
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
        }
        function s() {
          (scrollDragCount = 0),
            receiver.strollingBySelect &&
              (jquery('#sidebar-content').stop(!0), (receiver.strollingBySelect = !1));
        }
        jquery('#sidepanel-segmented-input-files').click(function () {
          receiver.switch('files', !0);
        }),
          jquery('#sidepanel-segmented-input-outline').click(function () {
            receiver.switch('outline', !0);
          }),
          sidebarElement
            .on('keydown', '[tabindex]', function (keyboardEvent) {
              'Esc' == map[keyboardEvent.keyCode || keyboardEvent.which] &&
                receiver.editor.focusCid &&
                receiver.editor.restoreLastCursor(null, !0);
            })
            .on('mousedown', '[tabindex]', function (pointerEvent) {
              if ('INPUT' != pointerEvent.target.tagName) {
                var lastCursor = receiver.editor.selection.buildUndo();
                lastCursor && (receiver.editor.lastCursor = lastCursor);
              }
            }),
          sidebarElement
            .on('dragstart', '.file-node-content', function (dragEvent) {
              if ('INPUT' != document.activeElement.tagName) {
                var parentElement = this.parentElement,
                  path = parentElement.dataset.path;
                receiver.setDraggingItem(
                  path,
                  parentElement.dataset.isDirectory + '' == 'true',
                  dragEvent,
                ),
                  dragEvent.originalEvent.dataTransfer.setData('file', path),
                  dragEvent.originalEvent.dataTransfer.setData('text/plain', path);
              }
            })
            .on('dragenter', "[data-is-directory='true'] > .file-node-content", function (event) {
              function i(delayMs) {
                setTimeout(function () {
                  parentElement.classList.contains('marklyra-on-drag-enter') &&
                    parentElement == currentParentElement &&
                    (jquery(parentElement)
                      .addClass('file-node-collapsed')
                      .removeClass('file-node-expanded'),
                    r(5e3));
                }, delayMs || 1e3);
              }
              function r(delayMs) {
                setTimeout(function () {
                  parentElement.classList.contains('marklyra-on-drag-enter') &&
                    parentElement == currentParentElement &&
                    receiver.fileTree.expandNode(
                      jquery(parentElement),
                      parentElement.dataset.path,
                      function () {
                        i(5e3);
                      },
                    );
                }, delayMs || 1e3);
              }
              dragEnterCount++, event.stopPropagation(), event.preventDefault();
              var dataTransfer = event.originalEvent.dataTransfer;
              if (
                (File.isWK &&
                  !receiver.draggingItem &&
                  (receiver.draggingItem = dataTransfer.getData('file')),
                receiver.draggingItem || (dataTransfer.types || []).indexOf('Files') > -1)
              ) {
                var parentElement = this.parentElement;
                setTimeout(function () {
                  currentParentElement = parentElement;
                }, 0),
                  jquery(this)
                    .closest('.marklyra-on-drag-enter')
                    .removeClass('marklyra-on-drag-enter'),
                  (!0 !== parentElement.dataset.hasSub && 'true' != parentElement.dataset.hasSub) ||
                    (parentElement.classList.contains('file-node-expanded') ? i(3e3) : r()),
                  jquery('.marklyra-on-drag-enter').removeClass('marklyra-on-drag-enter'),
                  parentElement.classList.add('marklyra-on-drag-enter');
              }
            })
            .on(
              'dragleave',
              '.marklyra-on-drag-enter > .file-node-content',
              function (unusedParameter1) {
                dragEnterCount--, (currentParentElement = null);
              },
            )
            .on('dragleave', ".marklyra-on-drag-enter[data-is-directory='true']", function (event) {
              if (!(dragEnterCount > 0)) {
                var domNode = event.target;
                domNode.classList.contains('file-node-content') &&
                  (domNode = domNode.parentElement),
                  domNode.classList.contains('marklyra-on-drag-enter') &&
                    (domNode.classList.remove('marklyra-on-drag-enter'), event.stopPropagation());
              }
            })
            .on('drop', "[data-is-directory='true']", function (event) {
              event.stopPropagation(), event.preventDefault();
              var currentItems = [],
                dataTransfer = event.originalEvent.dataTransfer;
              if (File.isActiveWindow()) {
                if (receiver.draggingItem) currentItems.push(receiver.draggingItem);
                else if (dataTransfer.files && dataTransfer.files.length) {
                  if (
                    (MediaOp.getPathForFile(dataTransfer.files.item(0)) ||
                      (currentItems = receiver.filesInDragging || []),
                    File.isNodeHtml)
                  )
                    for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                      var filePath = MediaOp.getPathForFile(dataTransfer.files.item(fileIndex));
                      filePath && currentItems.push(filePath);
                    }
                } else
                  dataTransfer.getData('text/uri-list') &&
                    currentItems.push(
                      dataTransfer.getData('text/uri-list').replace(/^file:[\/]+/, ''),
                    );
                receiver.clearDraggingItem(),
                  currentItems.length &&
                    (receiver.fileTree.expand(this.dataset.path),
                    receiver.copyOrMoveFiles(currentItems, this.dataset.path));
              }
            })
            .on('drop', function (event) {
              event.stopPropagation(), event.preventDefault();
            })
            .on('mouseup', function () {
              receiver.clearDraggingItem(), s();
            }),
          File.isMac &&
            sidebarElement
              .on('dragenter', '.sidebar-tabs', function (event) {
                event.preventDefault(), scrollDragCount++, a(!0);
              })
              .on('dragleave', '.sidebar-tabs', function (event) {
                event.preventDefault(), !--scrollDragCount && s();
              })
              .on('dragenter', '#marklyra-sidebar-footer', function (event) {
                event.preventDefault(), scrollDragCount++, a(!1);
              })
              .on('dragleave', '#marklyra-sidebar-footer', function (event) {
                event.preventDefault(), !--scrollDragCount && s();
              }),
          jquery('#marklyra-sidebar-footer')
            .on('click', '#sidebar-new-file-btn', function () {
              return editor.focusAndRestorePos(), receiver.newFile(File.getMountFolder()), !1;
            })
            .on('click', '#switch-file-list-btn', function () {
              return (
                editor.focusAndRestorePos(), receiver.switchTreeOrList(!receiver.useTreeStyle), !1
              );
            })
            .on('click', '#target-cur-file-btn', function () {
              return (
                editor.focusAndRestorePos(),
                File.getMountFolder() &&
                  receiver.getDelegate().focusToFile(fileIntegration.getCurrentFilePath()),
                !1
              );
            })
            .on('mousedown', '#sidebar-menu-btn .sidebar-footer-item', function () {
              return (
                editor.focusAndRestorePos(),
                jquery('.show-sidebar-footer-context').length ? r() : receiver.showSidebarMenu(),
                !1
              );
            }),
          jquery('.sidebar-tabs')
            .on('click', '#hide-sidebar-btn', function () {
              return editor.focusAndRestorePos(), receiver.hideSidebar(), !1;
            })
            .on('click', '#switch-sidebar-icon', function () {
              return (
                editor.focusAndRestorePos(),
                receiver.switch(receiver.isFileTabShown() ? 'outline' : 'files'),
                !1
              );
            }),
          jquery('#sidebar-files-menu')
            .on('blur', function () {
              setTimeout(r, 10);
            })
            .on('mousedown', '#close-sidebar-menu-btn', function () {
              r();
            })
            .on('mousedown', '#new-file-from-sidebar-menu', function (pointerEvent) {
              1 == pointerEvent.which && receiver.newFile(File.getMountFolder());
            })
            .on('mousedown', '#reveal-folder-from-sidebar-menu', function (pointerEvent) {
              1 == pointerEvent.which &&
                File.getMountFolder() &&
                JSBridge.openFolder(File.getMountFolder());
            })
            .on('mousedown', '#search-from-sidebar-menu', function (pointerEvent) {
              1 == pointerEvent.which && File.getMountFolder() && receiver.fileSearch.show(!0);
            })
            .on('mousedown', '#refresh-from-sidebar-menu', function (pointerEvent) {
              1 == pointerEvent.which && receiver.refreshPanelCommand();
            })
            .on('mousedown', '#open-folder-from-sidebar-menu', function (pointerEvent) {
              1 == pointerEvent.which &&
                (jquery('#sidebar-files-menu').trigger('blur'),
                setTimeout(receiver.selectFolder.bind(receiver), 100));
            })
            .on('mousedown', '[data-side-mode]', function (pointerEvent) {
              1 == pointerEvent.which && receiver.switch(this.getAttribute('data-side-mode'));
            })
            .on('mousedown', '.sidebar-folder-pin', async function (event) {
              if ((event.stopPropagation(), event.preventDefault(), 1 == event.which)) {
                var element = jquery(this).closest('.folder-menu-item'),
                  isPinned = 'true' == element.attr('data-pinned'),
                  path = element.attr('data-path');
                await JSBridge.invoke('setting.updateRecentFile', {
                  path: path,
                  pinned: !isPinned,
                }),
                  receiver.showSidebarMenu();
              }
            })
            .on('mousedown', '.sidebar-folder-remove', function (event) {
              if ((event.stopPropagation(), event.preventDefault(), 1 == event.which)) {
                var element = jquery(this).closest('.folder-menu-item');
                JSBridge.invoke('setting.removeRecentFolder', element.attr('data-path')),
                  element.remove();
              }
            })
            .on('mousedown', '.folder-menu-item', function (keyboardEvent) {
              1 == keyboardEvent.which &&
                ((File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
                  ? receiver.openWithCtrl(this.getAttribute('data-path'), !0)
                  : File.getMountFolder() != this.getAttribute('data-path') &&
                    JSBridge.invoke('controller.switchFolder', this.getAttribute('data-path')),
                r());
            })
            .on('mousedown', '#marklyra-group-by-folder-btn', function (unusedParameter1) {
              return receiver.getDelegate().setGroupByFolder(!receiver.getDelegate().noGroup), !1;
            })
            .on('mousedown', '#marklyra-sort-by-natural-btn', function () {
              return (
                this.classList.contains('active')
                  ? receiver.setSortType(
                      receiver.sortType() ? SortType.Natural : SortType.NaturalDescend,
                    )
                  : receiver.setSortType(
                      this.classList.contains('marklyra-sort-by-natural-d')
                        ? SortType.NaturalDescend
                        : SortType.Natural,
                    ),
                jquery(this).trigger('mouseenter'),
                !1
              );
            })
            .on('mousedown', '#marklyra-sort-by-name-btn', function () {
              return (
                this.classList.contains('active')
                  ? receiver.setSortType(-receiver.sortType())
                  : receiver.setSortType(this.classList.contains('marklyra-sort-a') ? -1 : 1),
                jquery(this).trigger('mouseenter'),
                !1
              );
            })
            .on('mousedown', '#marklyra-sort-by-date-btn', function () {
              return (
                this.classList.contains('active')
                  ? receiver.setSortType(-receiver.sortType())
                  : receiver.setSortType(this.classList.contains('marklyra-sort-t') ? -2 : 2),
                jquery(this).trigger('mouseenter'),
                !1
              );
            })
            .on('mousedown', '#marklyra-sort-by-create-btn', function () {
              return (
                this.classList.contains('active')
                  ? receiver.setSortType(-receiver.sortType())
                  : receiver.setSortType(
                      this.classList.contains('marklyra-sort-new-down') ? -3 : 3,
                    ),
                jquery(this).trigger('mouseenter'),
                !1
              );
            })
            .on('keydown', function (keyboardEvent) {
              'Esc' != map[keyboardEvent.keyCode || keyboardEvent.which] ||
                keyboardEvent.metaKey ||
                keyboardEvent.ctrlKey ||
                this.blur();
            }),
          this.fileTree.bindEvents(),
          this.fileList.bindEvents(),
          File.isNodeHtml && this.bindContext();
      }
      async execRenameFileByNode(oldPath, newPath, backupDestination) {
        const fileSystem = reqnode('fs-extra'),
          pathUtilities = reqnode('path');
        var undoPath = newPath;
        if (backupDestination) {
          let fileName = pathUtilities.basename(newPath);
          try {
            (undoPath = File.option.tempPath + sep + 'marklyra-undo' + sep + fileName),
              fileSystem.copySync(file, undoPath, { overwrite: !0, preserveTimestamps: !0 });
          } catch (error) {
            undoPath = '';
          }
        }
        var renameError = null;
        try {
          if (await this.tryChangeEmptyFileFormat(oldPath, newPath)) return [];
          await (async function (oldPath, newPath) {
            try {
              await fileSystem.rename(oldPath, newPath);
            } catch (currentError) {
              currentError &&
                'EPERM' == currentError.code &&
                (await fileSystem.move(oldPath, newPath, { overwrite: !0 }));
            }
          })(oldPath, newPath);
        } catch (localError) {
          renameError = localError;
        }
        return [renameError, undoPath];
      }
      copyOrMoveFiles(inputItems, separator) {
        var pathSeparator = File.isWin ? '\\' : '/',
          mountFolder = File.getMountFolder();
        if (mountFolder) {
          mountFolder += pathSeparator;
          var receiver = this,
            openMovedFile = 1 == inputItems.length && this.isDiscardableUntitled();
          inputItems.forEach(function (text) {
            text != separator &&
              (0 != separator.indexOf(text + pathSeparator) &&
              text.substring(0, text.lastIndexOf(pathSeparator)) != separator
                ? File.isNode
                  ? (function (oldPath, openMovedFile) {
                      var fileSystem = reqnode('fs-extra'),
                        pathUtilities = reqnode('path'),
                        fileName = pathUtilities.basename(oldPath),
                        newPath = pathUtilities.join(separator, fileName);
                      function c(error) {
                        dialogs.showNotification(
                          '<strong>' +
                            jquery.localize.getString('Operation Failed', 'Panel') +
                            '</strong>  ' +
                            utilities.escape(error.message || ''),
                          !0,
                        ),
                          JSBridge.invoke('filesOp.clearUndo');
                      }
                      async function h(oldPath, newPath, backupDestination) {
                        var [renameError, undoPath] = await receiver.execRenameFileByNode(
                          oldPath,
                          newPath,
                          backupDestination,
                        );
                        !(function (inputOldPath, inputNewPath, renameError) {
                          renameError
                            ? ('EXDEV' == renameError.code || 'EPERM' == renameError.code
                                ? fileSystem.copy(
                                    inputOldPath,
                                    inputNewPath,
                                    async function (copyError) {
                                      copyError
                                        ? c(copyError)
                                        : undoPath &&
                                          (await JSBridge.invoke('filesOp.clearUndo'),
                                          receiver.scheduleChangeHighlight(inputNewPath));
                                    },
                                  )
                                : c(renameError),
                              (inputNewPath = inputOldPath))
                            : undoPath &&
                              JSBridge.invoke(
                                'filesOp.registerUndo',
                                undoPath,
                                inputOldPath,
                                jquery.localize
                                  .getString('Move %@', 'Panel')
                                  .replace('%@', reqnode('path').basename(inputOldPath)),
                              ),
                            renameError ||
                              (openMovedFile
                                ? File.isNode &&
                                  fileIntegration.statWrapper(inputNewPath, function (fileInfo) {
                                    fileInfo.isFile &&
                                      fileIntegration.isSupportedFile(fileInfo.name) &&
                                      receiver.openFile(inputNewPath);
                                  })
                                : receiver.scheduleChangeHighlight(inputNewPath)),
                            JSBridge.invoke('app.sendEvent', 'didRename', {
                              oldPath: inputOldPath,
                              newPath: inputNewPath,
                            });
                        })(oldPath, newPath, renameError);
                      }
                      function p() {
                        JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: oldPath }),
                          fileSystem.existsSync(newPath)
                            ? JSBridge.invoke('dialog.showMessageBox', {
                                type: 'warning',
                                message: jquery.localize.getString(
                                  'File/directory already exists at target path.',
                                  'Panel',
                                ),
                                buttons: [
                                  jquery.localize.getString('Keep Both', 'Panel'),
                                  jquery.localize.getString('Replace'),
                                  jquery.localize.getString('Cancel'),
                                ],
                                defaultId: 1,
                                cancelId: 2,
                              }).then(({ response: buttonIndex }) => {
                                0 == buttonIndex
                                  ? (function s() {
                                      var endOffset = fileName.indexOf('.'),
                                        baseName =
                                          -1 == endOffset
                                            ? fileName
                                            : fileName.substring(0, endOffset),
                                        extension =
                                          -1 == endOffset ? '' : fileName.substring(endOffset);
                                      (fileName = baseName + ' (copy)' + extension),
                                        (newPath = pathUtilities.join(separator, fileName)),
                                        fileSystem.existsSync(newPath)
                                          ? s()
                                          : receiver
                                              .execRenameFileByNode(oldPath, newPath)
                                              .then(function ([renameError]) {
                                                renameError
                                                  ? (c(renameError), (newPath = oldPath))
                                                  : (JSBridge.invoke(
                                                      'filesOp.registerUndo',
                                                      newPath,
                                                      oldPath,
                                                      jquery.localize
                                                        .getString('Move %@', 'Panel')
                                                        .replace(
                                                          '%@',
                                                          reqnode('path').basename(oldPath),
                                                        ),
                                                    ),
                                                    openMovedFile
                                                      ? receiver.openFile(newPath)
                                                      : receiver.scheduleChangeHighlight(newPath)),
                                                  JSBridge.invoke('app.sendEvent', 'didRename', {
                                                    oldPath: oldPath,
                                                    newPath: newPath,
                                                  });
                                              });
                                    })()
                                  : 1 == buttonIndex
                                    ? h(oldPath, newPath, !0)
                                    : ((newPath = oldPath),
                                      JSBridge.invoke('app.sendEvent', 'didRename', {
                                        oldPath: oldPath,
                                        newPath: newPath,
                                      }));
                              })
                            : h(oldPath, newPath);
                      }
                      var warningSetting = receiver.useTreeStyle
                        ? 'noWarnigForMoveFile'
                        : 'noWarnigForMoveFileToList';
                      File.option[warningSetting]
                        ? p()
                        : dialogs
                            .showWarningDialog(
                              jquery.localize
                                .getString('Are you sure you want to move %@?', 'Panel')
                                .replace('%@', fileName),
                              !0,
                            )
                            .then(({ response: buttonIndex, checkboxChecked: dontAskAgain }) => {
                              0 == buttonIndex &&
                                (p(),
                                dontAskAgain &&
                                  (JSBridge.execForAll(
                                    'window.File && File.option && (File.option.%@ = true)'.replace(
                                      '%@',
                                      warningSetting,
                                    ),
                                  ),
                                  JSBridge.putSetting(warningSetting, !0)));
                            });
                    })(text, openMovedFile)
                  : File.isMac &&
                    (function (source, openMovedFile) {
                      var fileName = fileIntegration.getFileNameFromPath(source);
                      openMovedFile = openMovedFile && fileIntegration.isSupportedFile(fileName);
                      var dest = separator + '/' + fileName;
                      bridge.callHandler('library.moveFile', {
                        source: source,
                        dest: dest,
                        shouldOpen: openMovedFile || !1,
                      });
                    })(text, openMovedFile)
                : receiver.getDelegate().highlight(text));
          });
        }
      }
      sortType() {
        return x(
          this.getDelegate().sortType,
          this.fileList.sortType || this.fileTree.sortType || 0,
        );
      }
      dateAffectsSort() {
        return DocumentNode.isType(
          this.sortType,
          SortType.Date,
          SortType.DateDescend,
          SortType.CreateDate,
          SortType.CreateDateDescend,
        );
      }
      compareItem(firstItem, secondItem) {
        if (!firstItem || !secondItem) return 1;
        function n(searchValue, normalizedText) {
          if (searchValue == normalizedText) return 0;
          (searchValue = searchValue.toLowerCase()),
            (normalizedText = normalizedText.toLowerCase());
          var currentSearchValue = searchValue.replace(/\..+/, ''),
            secondBaseName = normalizedText.replace(/\..+/g, '');
          return File.isWin
            ? currentSearchValue == secondBaseName
              ? 0 == [searchValue, normalizedText].sort().indexOf(searchValue)
                ? -1
                : 1
              : 0 == [currentSearchValue, secondBaseName].sort().indexOf(currentSearchValue)
                ? -1
                : 1
            : currentSearchValue == secondBaseName
              ? searchValue.localeCompare(normalizedText)
              : currentSearchValue.localeCompare(secondBaseName);
        }
        var sortType = this.sortType();
        return sortType == SortType.Alphabet
          ? n(firstItem.name, secondItem.name)
          : sortType == SortType.Date
            ? firstItem.lastModified - secondItem.lastModified
            : sortType == SortType.AlphabetDescend
              ? n(secondItem.name, firstItem.name)
              : sortType == SortType.DateDescend
                ? secondItem.lastModified - firstItem.lastModified
                : sortType == SortType.CreateDate
                  ? firstItem.createDate - secondItem.createDate
                  : sortType == SortType.CreateDateDescend
                    ? secondItem.createDate - firstItem.createDate
                    : sortType == SortType.NaturalDescend
                      ? -utilities.naturalCompare(firstItem.name, secondItem.name)
                      : utilities.naturalCompare(firstItem.name, secondItem.name);
      }
      setSortType(sortType) {
        jquery('.marklyra-side-sort-btn2').removeClass('active'),
          sortType == SortType.Alphabet
            ? jquery('#marklyra-sort-by-name-btn')
                .removeClass('marklyra-sort-a')
                .addClass('active')
                .attr('marklyra-hint', jquery.localize.getString('Sort by Name (Ascending)'))
            : sortType == SortType.Date
              ? jquery('#marklyra-sort-by-date-btn')
                  .removeClass('marklyra-sort-t')
                  .addClass('active')
                  .attr(
                    'marklyra-hint',
                    jquery.localize.getString('Sort by Modification Date (Ascending)'),
                  )
              : sortType == SortType.AlphabetDescend
                ? jquery('#marklyra-sort-by-name-btn')
                    .addClass('marklyra-sort-a')
                    .addClass('active')
                    .attr('marklyra-hint', jquery.localize.getString('Sort by Name (Descending)'))
                : sortType == SortType.DateDescend
                  ? jquery('#marklyra-sort-by-date-btn')
                      .addClass('marklyra-sort-t')
                      .addClass('active')
                      .attr(
                        'marklyra-hint',
                        jquery.localize.getString('Sort by Modification Date (Descending)'),
                      )
                  : sortType == SortType.CreateDate
                    ? jquery('#marklyra-sort-by-create-btn')
                        .removeClass('marklyra-sort-new-down')
                        .addClass('active')
                        .attr(
                          'marklyra-hint',
                          jquery.localize.getString('Sort by Creation Date (Ascending)'),
                        )
                    : sortType == SortType.CreateDateDescend
                      ? jquery('#marklyra-sort-by-create-btn')
                          .addClass('marklyra-sort-new-down')
                          .addClass('active')
                          .attr(
                            'marklyra-hint',
                            jquery.localize.getString('Sort by Creation Date (Descending)'),
                          )
                      : sortType == SortType.NaturalDescend
                        ? jquery('#marklyra-sort-by-natural-btn')
                            .addClass('marklyra-sort-by-natural-d')
                            .addClass('active')
                            .attr(
                              'marklyra-hint',
                              jquery.localize.getString('Sort Naturally (Descending)'),
                            )
                        : jquery('#marklyra-sort-by-natural-btn')
                            .removeClass('marklyra-sort-by-natural-d')
                            .addClass('active')
                            .attr(
                              'marklyra-hint',
                              jquery.localize.getString('Sort Naturally (Ascending)'),
                            ),
          this.getDelegate().sortType != sortType && this.getDelegate().setSortType(sortType);
      }
      selectFolder() {
        if (File.isMac) bridge.callHandler('controller.selectFolder');
        else {
          var receiver = this;
          JSBridge.invoke('dialog.showOpenDialog', {
            buttonLabel: jquery.localize.getString('Select'),
            properties: ['openDirectory'],
          }).then(({ filePaths: folderPaths }) => {
            var folderPath = (folderPaths || [])[0];
            folderPath && receiver.onRootChanged(folderPath);
          });
        }
      }
      showSidebarMenu() {
        jquery('.sidebar-footer').addClass('show-sidebar-footer-context');
        var e,
          sidebarMenu = jquery('#sidebar-files-menu').focus(),
          folderTemplate = jquery('#folder-menu-item-template').html();
        function i(folderEntry, insertBefore) {
          var element = jquery(folderTemplate);
          return (
            element.find('span').text(folderEntry.name),
            element.attr('data-path', folderEntry.path),
            element.attr('data-pinned', folderEntry.pinned),
            element.attr('marklyra-hint', utilities.abbreviatingWithTilde(folderEntry.path)),
            folderEntry.pinned &&
              element.find('.sidebar-folder-pin').attr('marklyra-hint', 'Unpin'),
            insertBefore.before(element),
            element
          );
        }
        (e = function (slice) {
          sidebarMenu.find('.folder-menu-item').remove().end().find('.folder-menu-group').show();
          var item,
            sidebarHeight = jquery('.sidebar-content').height(),
            clientHeight = sidebarMenu.find('#reveal-folder-from-sidebar-menu')[0].clientHeight,
            currentClientHeight = sidebarMenu[0].clientHeight,
            maxVisibleFolders = Math.max(
              0,
              Math.min(6, Math.floor((sidebarHeight - currentClientHeight - 20) / clientHeight)),
            ),
            currentItems = [],
            localItems = [];
          slice.forEach(function (inputItem) {
            inputItem.path === File.getMountFolder()
              ? (item = inputItem)
              : inputItem.pinned
                ? currentItems.push(inputItem)
                : localItems.push(inputItem);
          }),
            File.getMountFolder() &&
              !item &&
              (item = {
                path: File.getMountFolder(),
                name: fileIntegration.getFileNameFromPath(File.getMountFolder()),
                pinned: !1,
              }),
            (slice = (slice = currentItems.concat(localItems)).slice(0, maxVisibleFolders));
          for (
            var menuAnchor = jquery('#folder-menu-item-after'), itemIndex = 0;
            itemIndex < slice.length;
            itemIndex++
          )
            i(slice[itemIndex], menuAnchor);
          item
            ? i(item, menuAnchor).addClass('selected-folder-menu-item')
            : 0 == slice.length && sidebarMenu.find('.folder-menu-group').removeClass('show');
        }),
          File.isMac
            ? bridge.callHandler('library.getRecentFolders', e)
            : File.isNode
              ? JSBridge.invoke('setting.getRecentFiles').then((result) => {
                  e(result.folders);
                })
              : e([]);
      }
      init() {
        this.bindEvents();
        var receiver = this;
        File.option.sidebarTab && this.show(),
          File.isMac &&
            !fileIntegration.getCurrentFilePath() &&
            bridge.callHandler('controller.shouldLoadFolder', function (opened) {
              opened &&
                (receiver.isFileTabShown() ||
                  receiver.show(receiver.useTreeStyle ? 'file-tree' : 'file-list'));
            });
      }
      switch(tabName, unusedParameter2) {
        if ((jquery('.sidebar-content').scrollTop(0), 'outline' == tabName)) {
          var switchLabel;
          this.fileSearch.hide(),
            jquery('#marklyra-sidebar')
              .addClass('active-tab-outline')
              .removeClass('active-tab-files'),
            jquery('[data-side-mode]').removeClass('selected-folder-menu-item'),
            jquery("[data-side-mode='outline']").addClass('selected-folder-menu-item'),
            jquery('#sidebar-footer-main-item-label').text(jquery.localize.getString('Outline')),
            this.outline.highlightVisibleHeader(),
            this.useTreeStyle
              ? ((switchLabel = jquery.localize.getString('Switch to File Tree view')),
                jquery('#switch-sidebar-icon')
                  .html('<span class="marklyra-icon marklyra-file-tree"></span>')
                  .attr('marklyra-hint', switchLabel)
                  .attr('aria-label', switchLabel))
              : ((switchLabel = jquery.localize.getString('Switch to File List view')),
                jquery('#switch-sidebar-icon')
                  .html('<span class="marklyra-icon marklyra-three-cells"></span>')
                  .attr('marklyra-hint', switchLabel)
                  .attr('aria-label', switchLabel));
        } else {
          this.outline.hideSearch(),
            jquery('#marklyra-sidebar')
              .removeClass('active-tab-outline')
              .addClass('active-tab-files');
          var useTreeStyle = this.useTreeStyle || !1;
          'file-list' == tabName
            ? (useTreeStyle = !1)
            : 'file-tree' == tabName
              ? (useTreeStyle = !0)
              : (tabName = useTreeStyle ? 'file-tree' : 'file-list'),
            this.switchTreeOrList(useTreeStyle),
            this.refreshMenuVisibility(),
            jquery('#switch-sidebar-icon')
              .html('<span class="marklyra-icon marklyra-list"></span>')
              .attr('marklyra-hint', jquery.localize.getString('Switch to Outline view'));
        }
        jquery('#switch-sidebar-icon').localize('Front', {
          language: File.language,
          pathPrefix: 'locales',
        }),
          JSBridge.putSetting('sidebar_tab', tabName),
          File.isNode
            ? window.ClientCommand.refreshViewMenu()
            : (this.updateMenu(tabName),
              jquery('.sidebar-tab')
                .removeClass('active')
                .filter(
                  'outline' == tabName
                    ? '#sidepanel-segmented-input-outline'
                    : '#sidepanel-segmented-input-files',
                )
                .addClass('active'));
      }
      shouldIgnore(filePath) {
        var relativePath = '/' + (filePath || '').substring((File.getMountFolder() || '').length);
        return !!/[\\\/](\.\w|node_modules[\\\/])/.exec(relativePath);
      }
      calcMountFolder(stopAtParent) {
        var receiver = this;
        return new Promise(function (resolvePromise, rejectPromise) {
          function r(mountFolder_) {
            (File.mountFolder_ = mountFolder_),
              resolvePromise(mountFolder_),
              receiver.isFileTabShown() && receiver.refreshMenuVisibility();
          }
          File.isMac
            ? bridge.callHandler('controller.calcMountFolder', r)
            : File.mountFolder_
              ? r(File.getMountFolder())
              : File.isNode &&
                r(
                  (function (folderPath) {
                    var pathUtilities = reqnode('path'),
                      fileSystem = reqnode('fs'),
                      currentSeparator = folderPath;
                    if (!folderPath) return null;
                    for (; currentSeparator && /^\w*\/+\w/.exec(currentSeparator); ) {
                      var folderEntries = fileSystem.readdirSync(currentSeparator);
                      if (
                        folderEntries.indexOf('.git') > -1 ||
                        folderEntries.indexOf('.svn') > -1 ||
                        folderEntries.indexOf('.hg') > -1 ||
                        folderEntries.indexOf('package.json') > -1
                      )
                        return currentSeparator;
                      if (
                        /((dropbox\/apps\/[^\/]+)|pages|articles?|blogs?|content)\/?$/i.exec(
                          currentSeparator,
                        )
                      )
                        return currentSeparator;
                      if (/(_?posts?|_?drafts?)\/?$/i.exec(currentSeparator))
                        return currentSeparator;
                      if (/(node_modules)\/[^\/]+\/?$/i.exec(currentSeparator))
                        return currentSeparator;
                      var separator = currentSeparator;
                      if (
                        (currentSeparator = pathUtilities.join(currentSeparator, '../')) ==
                          separator ||
                        stopAtParent
                      )
                        break;
                    }
                    return folderPath || null;
                  })(fileIntegration.getCurrentFileFolderPath()),
                );
        });
      }
      renderIfNeed() {
        return this.useTreeStyle ? this.fileTree.renderIfNeed() : this.fileList.renderIfNeed();
      }
      findElemFromPath(filePath) {
        return jquery(".file-library-node[data-path='" + utilities.escapeSelector(filePath) + "']");
      }
      revealInSidebar() {
        this.fileSearch.hide(),
          this.isFileTabShown()
            ? this.markCurrentFile()
            : fileIntegration.getCurrentFilePath() && this.showSidebar('files');
      }
      revealInFileList() {
        this.showSidebar('file-list'), this.markCurrentFile();
      }
      revealInFileTree() {
        this.showSidebar('file-tree'), this.markCurrentFile();
      }
      markCurrentFile(immediate, skipFocus) {
        var filePath = fileIntegration.getCurrentFilePath();
        filePath &&
          (this.markOpenedFile(filePath),
          !skipFocus && this.getDelegate().focusToFile(filePath, immediate),
          this.fileSearch.markOpenedFile(filePath));
      }
      markOpenedFile(filePath) {
        if (!filePath) return jquery();
        var element = this.findElemFromPath(filePath);
        return (
          jquery('.file-library-node.active').removeClass('active'),
          element.length && element.addClass('active'),
          element
        );
      }
      end() {
        if (
          (this.fileTree.needRepaint(),
          this.fileList.needRepaint(!0),
          (this.root = null),
          (File.mountFolder_ = null),
          this.fsWatcher)
        )
          this.fsWatcher.close(),
            (this.fsWatcher = null),
            (this.watchedFolder = null),
            localTimerId && clearTimeout(localTimerId);
        else {
          for (var watchedPath in this.unixWatchers)
            this.unixWatchers[watchedPath] && this.unixWatchers[watchedPath].close();
          this.unixWatchers = {};
        }
      }
      refreshMenuVisibility() {
        var footerElement = jquery('#marklyra-sidebar-footer');
        File.getMountFolder()
          ? (footerElement.find('.empty-menu-group').removeClass('show'),
            footerElement.find('.not-empty-menu-group').addClass('show'),
            jquery('#marklyra-sidebar').removeClass('marklyra-no-mount-folder'),
            this.isReadOnlyRoot()
              ? document.querySelector('#sidebar-new-file-btn').classList.add('hide')
              : document.querySelector('#sidebar-new-file-btn').classList.remove('hide'))
          : (footerElement.find('.empty-menu-group').addClass('show'),
            footerElement.find('.not-empty-menu-group').removeClass('show'),
            jquery('#marklyra-sidebar').addClass('marklyra-no-mount-folder')),
          jquery('#sidebar-footer-main-item-label').text(
            fileIntegration.getFileNameFromPath(File.getMountFolder()) ||
              jquery.localize.getString('Open Folder...'),
          );
      }
      isReadOnlyRoot() {
        const text = File.getMountFolder();
        if (text)
          return File.isMac
            ? text.toLowerCase().indexOf('marklyra.app') > -1
            : !window.debugMode &&
                (window.dirname
                  ? text.toLowerCase().indexOf(window.dirname.toLowerCase()) > -1
                  : void 0);
      }
      onRootChanged(folderPath, skipRecentFolder) {
        if (
          (this.end(),
          folderPath &&
            (File.setMountFolder(folderPath),
            File.isNode &&
              !skipRecentFolder &&
              JSBridge.invoke('setting.addRecentFolder', folderPath)),
          jquery('#file-library:visible').length && this.renderIfNeed(),
          this.editor.quickOpenPanel)
        )
          this.editor.quickOpenPanel.cacheFolder(folderPath);
        else {
          var editor = this.editor;
          setTimeout(function () {
            editor.quickOpenPanel && editor.quickOpenPanel.cacheFolder(folderPath);
          }, 1e3);
        }
        this.refreshMenuVisibility();
      }
      setMountFolder(folderPath, showSidebar, silent) {
        console.debug('open folder ' + folderPath),
          (this.silent = silent),
          this.onRootChanged(folderPath),
          showSidebar && this.showSidebar(this.useTreeStyle ? 'file-tree' : 'file-library', !0);
      }
      onFileUpdated(fileInfo) {
        var path = (fileInfo || {}).path;
        try {
          path == File.bundle.filePath && (File.bundle.modifiedDate = fileInfo.lastModifiedDate),
            this.fileList.onFileUpdated(path, fileInfo),
            this.fileTree.onFileUpdated(path);
        } catch (error) {
          console.warn(error);
        }
        try {
          this.pauseOnChange(!0, path);
        } catch (currentError) {}
      }
      onFileChanges(inputItems) {
        if (File.getMountFolder()) {
          console.debug(inputItems),
            console.debug('suppress on change -> ' + suppressChanges),
            this.fileTree.onChangeForMac(inputItems),
            this.fileList.onChangeForMac(inputItems);
          var currentFileRenamed = !1,
            oldPath = fileIntegration.getCurrentFilePath();
          if (
            (inputItems.map(function (item) {
              item.oldPath == oldPath && 'rename' == item.type && (currentFileRenamed = !0);
            }),
            currentFileRenamed)
          ) {
            var receiver = this;
            setTimeout(function () {
              receiver.markCurrentFile();
            }, 1e3);
          }
        }
      }
      getDelegate() {
        return this.useTreeStyle ? this.fileTree : this.fileList;
      }
      isDiscardableUntitled() {
        return !(File.isDocumentEdited() || File.bundle.filePath);
      }
      newFile(folderPath) {
        File.getMountFolder() && this.getDelegate().newFile(folderPath);
      }
      openFileCommand(targetElement) {
        targetElement || retrun;
        var filePath = this.editor
          .getJQueryElem(targetElement)
          .closest('.file-library-node, .marklyra-search-item')
          .attr('data-path');
        this.openFile(filePath), this.outline.autoHideOutline();
      }
      openFileInNewWindowCommand(targetElement) {
        if (
          (targetElement = this.editor
            .getJQueryElem(targetElement)
            .closest('.file-library-node, .marklyra-search-item')[0])
        ) {
          var isDirectory = 'true' == targetElement.dataset.isDirectory,
            path = targetElement.dataset.path;
          this.openFileInNewWindow(path, isDirectory);
        }
      }
      copyFullPathCommand(targetElement) {
        var filePath = this.editor
          .getJQueryElem(targetElement)
          .closest('.file-library-node, .marklyra-search-item')
          .attr('data-path');
        this.editor.UserOp.setClipboard('<span>' + filePath + '</span>', null, filePath, !0);
      }
      revealFileInFinderCommand(pathOrElement) {
        var filePath =
          'string' == typeof pathOrElement
            ? pathOrElement
            : this.editor
                .getJQueryElem(pathOrElement)
                .closest('.file-library-node, .marklyra-search-item')
                .attr('data-path');
        JSBridge.showInFinder(filePath);
      }
      renameFileCommand(targetElement, newlyCreated) {
        this.getDelegate().renameFileCommand(targetElement, newlyCreated);
      }
      newFileCommand(targetElement, createDirectory) {
        this.getDelegate().newFileCommand(targetElement, createDirectory);
      }
      newFolderCommand(targetElement) {
        this.fileTree.newFolderCommand(targetElement);
      }
      doDeleteFile(toDel, targetElement, onDeleted) {
        var element = targetElement
            ? this.editor.getJQueryElem(targetElement).closest('.file-library-node')
            : this.findElemFromPath(toDel),
          isCurrentFile =
            (toDel = toDel || element.attr('data-path')) == fileIntegration.getCurrentFilePath();
        if (toDel) {
          var receiver = this;
          if (File.isMac)
            bridge.callHandler('library.trashItem', toDel, function (deleted) {
              deleted && (s(), element.hide()), onDeleted && onDeleted(deleted);
            });
          else if (File.isNode)
            if (File.option.noWarnigForDeleteFile) l();
            else {
              var fileName = reqnode('path').basename(toDel);
              JSBridge.invoke('dialog.showMessageBox', {
                type: 'question',
                message: jquery.localize
                  .getString('Are you sure you want to delete %@?', 'Panel')
                  .replace('%@', fileName),
                detail: jquery.localize.getString('You can restore from the Trash.', 'Panel'),
                defaultId: 0,
                cancelId: 1,
                buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
                checkboxLabel: jquery.localize.getString('Do not show this again', 'Panel'),
              }).then(({ response: buttonIndex, checkboxChecked: dontAskAgain }) => {
                0 == buttonIndex
                  ? (dontAskAgain &&
                      (JSBridge.execForAll(
                        'window.File && File.option && (File.option.noWarnigForDeleteFile = true)',
                      ),
                      JSBridge.putSetting('noWarnigForDeleteFile', !0)),
                    l())
                  : onDeleted && onDeleted(!1);
              });
            }
        } else onDeleted && onDeleted(!1);
        function s() {
          if (isCurrentFile) {
            var nextFileElement = receiver.useTreeStyle
              ? jquery()
              : element.filter('.file-list-item').next();
            !onDeleted && nextFileElement.length
              ? receiver.openFileCommand(nextFileElement[0])
              : File.isNode
                ? S(null, () => {
                    onDeleted && onDeleted(!0);
                  })
                : onDeleted && onDeleted(!0);
          }
        }
        async function l() {
          if (await JSBridge.invoke('shell.trashItem', toDel))
            s(),
              element.hide(),
              JSBridge.invoke('filesOp.clearUndo'),
              JSBridge.invoke('app.sendEvent', 'updateQuickOpenCache', { toDel: toDel });
          else {
            var backupPath = File.option.tempPath + '/' + new Date().getTime(),
              fileSystem = reqnode('fs-extra'),
              backupCreated = !1;
            try {
              await fileSystem.copyFile(toDel, backupPath), (backupCreated = !0);
            } catch (error) {}
            JSBridge.invoke('dialog.showMessageBox', {
              type: 'info',
              title: jquery.localize.getString('Operation Failed', 'Panel'),
              message: jquery.localize.getString(
                'Failed to move target file or folder to trash',
                'Panel',
              ),
              defaultId: 0,
              cancelId: 2,
              buttons: [
                jquery.localize.getString('Reveal in File Explorer'),
                jquery.localize.getString(
                  'Delete Permanently' + (backupCreated ? '' : ' (cannot be undo)'),
                ),
                jquery.localize.getString('Cancel'),
              ],
            }).then(({ response: buttonIndex }) => {
              0 == buttonIndex
                ? (JSBridge.invoke('shell.openItem', toDel), onDeleted && onDeleted(!1))
                : 1 == buttonIndex
                  ? fileSystem.unlink(toDel, function (deleteError) {
                      deleteError
                        ? JSBridge.invoke('dialog.showMessageBox', {
                            type: 'info',
                            title: jquery.localize.getString('Error', 'Panel'),
                            message: jquery.localize.getString('Operation Failed', 'Panel'),
                            detail:
                              deleteError.stack ||
                              deleteError.message ||
                              (deleteError || '').toString(),
                            defaultId: 0,
                            cancelId: 1,
                            buttons: [
                              jquery.localize.getString('Reveal in File Explorer'),
                              jquery.localize.getString('Cancel'),
                            ],
                          }).then(({ response: buttonIndex }) => {
                            0 == buttonIndex && JSBridge.invoke('shell.openItem', toDel),
                              onDeleted && onDeleted(!1);
                          })
                        : (backupCreated
                            ? JSBridge.invoke(
                                'filesOp.registerUndo',
                                backupPath,
                                toDel,
                                jquery.localize
                                  .getString('Delete %@', 'Menu')
                                  .replace('%@', reqnode('path').basename(toDel)),
                              )
                            : JSBridge.invoke('filesOp.clearUndo'),
                          s());
                    })
                  : onDeleted && onDeleted(!1);
            });
          }
        }
      }
      deleteFileCommand(targetElement) {
        this.doDeleteFile(null, targetElement);
      }
      showFilePropertyCommand(targetElement) {
        var filePath = this.editor
          .getJQueryElem(targetElement)
          .closest('.file-library-node')
          .attr('data-path');
        filePath &&
          (File.isWin
            ? fileIntegration.winShell().openProperties(File.bundle.filePath)
            : File.isMac && bridge.callHandler('library.showProperty', filePath));
      }
      duplicateFileCommand(targetElement) {
        var textSlice,
          pathUtilities,
          fileName,
          startOffset,
          directoryPath,
          fileSystem,
          currentSep,
          sourcePath = this.editor
            .getJQueryElem(targetElement)
            .closest('.file-library-node')
            .attr('data-path'),
          receiver = this;
        async function p(filePath) {
          return (
            !!receiver.isDiscardableUntitled() ||
            (filePath === File.bundle.filePath &&
              (!(!File.option.enableAutoSave && !File.option.saveFileOnSwitch) ||
                !(!File.isMac || !(await JSBridge.invoke('controller.canSwitchWithoutAsk'))) ||
                !(
                  File.isMac ||
                  (File.bundle.hasModified && File.changeCounter.isDocumentEdited())
                ) ||
                (await new Promise(function (resolvePromise, rejectPromise) {
                  dialogs.showNativeDialog({
                    message: jquery.localize.getString(
                      'Current document contains unsaved changes. Do you want to switch to newly duplicated file?',
                      'Panel',
                    ),
                    buttons: [
                      jquery.localize.getString('Ok', 'Panel'),
                      jquery.localize.getString('Cancel'),
                    ],
                    callback: function (buttonIndex, unusedParameter2) {
                      resolvePromise(0 === buttonIndex);
                    },
                  });
                }))))
          );
        }
        function f(path) {
          var sourceElement = receiver.findElemFromPath(sourcePath),
            folderPath = File.isMac ? path.replace(/\/[^\/]+$/, '') : reqnode('path').dirname(path),
            newFileElement = receiver.getDelegate().onAddFile({
              isDirectory: !1,
              isFile: !0,
              name: fileIntegration.getFileNameFromPath(path),
              path: path,
              folderPath: folderPath,
              folderName: fileIntegration.getFileNameFromPath(folderPath),
              lastModified: new Date(),
              summary: sourceElement.find('.file-list-item-summary').text(),
              fetched: !0,
            });
          newFileElement &&
            (receiver.getDelegate().focusToFile(path, !1, !0),
            receiver.renameFileCommand(newFileElement, !0));
        }
        File.isNode
          ? ((pathUtilities = reqnode('path')),
            (fileName = pathUtilities.basename(sourcePath)),
            (startOffset = fileName.lastIndexOf('.')),
            (directoryPath = pathUtilities.dirname(sourcePath)),
            (fileSystem = reqnode('fs')),
            (currentSep = pathUtilities.sep),
            startOffset < 0 && (startOffset = newFileName.length),
            (textSlice = fileName.substr(startOffset)),
            (fileName = fileName.substr(0, startOffset)),
            JSBridge.invoke('filesOp.clearUndo'),
            (function e(sourcePath, baseName, extension, folderPath) {
              baseName = '%@ (copy)'.replace('%@', baseName);
              var destinationPath = folderPath + currentSep + baseName + extension;
              fileSystem.copyFile(
                sourcePath,
                destinationPath,
                fileSystem.constants.COPYFILE_EXCL,
                function (copyError) {
                  copyError
                    ? 'EEXIST' == copyError.code
                      ? e(sourcePath, baseName, extension, folderPath)
                      : copyError &&
                        dialogs.showNotification(
                          '<strong>' +
                            jquery.localize.getString('Operation Failed', 'Panel') +
                            '</strong>  ' +
                            utilities.escape(copyError.message || ''),
                          !0,
                        )
                    : (receiver.scheduleChangeHighlight(destinationPath),
                      File.isWin && f(destinationPath),
                      p(sourcePath).then(function (result) {
                        result && receiver.openFile(destinationPath);
                      }));
                },
              );
            })(sourcePath, fileName, textSlice, directoryPath))
          : (function (sourcePath) {
              bridge.callHandler('library.duplicate', sourcePath, function (destinationPath) {
                destinationPath &&
                  (p(sourcePath).then(function (result) {
                    result && receiver.openFile(destinationPath);
                  }),
                  receiver.scheduleChangeHighlight(destinationPath),
                  f(destinationPath));
              });
            })(sourcePath);
      }
      scheduleChangeHighlight(nextChangeHighlight) {
        this.nextChangeHighlight = nextChangeHighlight;
        var receiver = this;
        receiver.getDelegate().highlight(nextChangeHighlight),
          this.nextChangeHighlightTimer && clearTimeout(this.nextChangeHighlightTimer),
          (this.nextChangeHighlightTimer = setTimeout(function () {
            (receiver.nextChangeHighlight = null), (receiver.nextChangeHighlightTimer = null);
          }, 2e3));
      }
      refreshPanelCommand() {
        var mountFolder = File.getMountFolder();
        mountFolder &&
          (this.end(),
          File.isNode
            ? (File.setMountFolder(mountFolder), this.renderIfNeed(), this.refreshMenuVisibility())
            : bridge.callHandler('controller.switchFolder', mountFolder, function () {
                bridge.callHandler('controller.bindFolderMonitor');
              }));
      }
      async tryChangeEmptyFileFormat(oldPath, newPath) {
        const fileSystem = reqnode('node:fs/promises');
        let normalizedText = fileIntegration.getExtension(oldPath).toLowerCase(),
          currentNormalizedText = fileIntegration.getExtension(newPath).toLowerCase();
        return !(
          !(
            ('textbundle' != normalizedText && 'textbundle' == currentNormalizedText) ||
            ('textbundle' == normalizedText && 'textbundle' != currentNormalizedText)
          ) ||
          !(await assetStorage.isEmptyFile(oldPath)) ||
          (await fileSystem.rm(oldPath, { force: !0, recursive: !0 }),
          File.FileSave.saveAsUseNode(newPath),
          JSBridge.invoke('filesOp.clearUndo'),
          0)
        );
      }
      async cannotRename(oldPath, newPath, unusedParameter3) {
        if (!File.option.supportTextBundle) return !1;
        let normalizedText = fileIntegration.getExtension(oldPath).toLowerCase(),
          currentNormalizedText = fileIntegration.getExtension(newPath).toLowerCase();
        function o(extension) {
          return 'textbundle' === extension
            ? 'TextBundle file'
            : 'textpack' === extension
              ? 'TextPack file'
              : 'Markdown file';
        }
        const text =
          'Cannot rename from $1 to $2, please use "File" → "Move To…" from menubar instead.';
        return !(
          normalizedText === currentNormalizedText ||
          ('textbundle' !== normalizedText &&
            'textpack' !== normalizedText &&
            'textbundle' !== currentNormalizedText &&
            'textpack' !== currentNormalizedText) ||
          (await assetStorage.isEmptyFile(oldPath)) ||
          (dialogs.showWarningDialog(
            jquery.localize.getString(
              text.replace('$1', o(normalizedText)).replace('$2', o(currentNormalizedText)),
              'Panel',
            ),
          ),
          0)
        );
      }
      bindRename(
        inputElement,
        onRename,
        onCancel,
        skipFormatValidation,
        renameOnBlur,
        renameCompatibilityFlag,
        newlyCreated,
        parentPath,
      ) {
        var blurHandled,
          renameHandled,
          originalName = inputElement.val(),
          receiver = this;
        function p(text) {
          return (
            File.isWin
              ? text.replace(/[\\\/:*?"<>\|\000-\031]/g, '')
              : text.replace(/[\/\\\000-\031]/g, '')
          ).trim();
        }
        async function m() {
          if (!renameHandled) {
            renameHandled = !0;
            var newName = p(inputElement.val()),
              pathSeparator = File.isWin ? '\\' : '/',
              oldPath = parentPath + pathSeparator + originalName,
              newPath = parentPath + pathSeparator + newName;
            if (newName.length > 0 && newName != originalName) {
              if (
                !skipFormatValidation &&
                !newlyCreated &&
                (await receiver.cannotRename(oldPath, newPath, renameCompatibilityFlag))
              )
                return void onCancel();
              inputElement.val(newName), onRename(inputElement);
            } else onCancel();
          }
        }
        function g(selectWholeName) {
          var fileName = inputElement.val(),
            endOffset = fileName.lastIndexOf('.');
          endOffset < 0 && selectWholeName && (endOffset = fileName.length),
            endOffset > 0 && inputElement[0].setSelectionRange(0, endOffset);
        }
        (renameOnBlur = !!newlyCreated),
          inputElement
            .off('blur')
            .on('blur', function () {
              if (!blurHandled) {
                if (receiver.stopRename) return !1;
                (blurHandled = !0),
                  renameOnBlur
                    ? m()
                    : (function (inputElement) {
                        inputElement.val(p(inputElement.val())),
                          originalName != inputElement.val()
                            ? dialogs.confirm(
                                jquery.localize
                                  .getString('Rename to "{0}" ?')
                                  .format(inputElement.val()),
                                function (unusedParameter1) {
                                  receiver.markFocusOnDialogClose(), m();
                                },
                                function () {
                                  onCancel();
                                },
                              )
                            : onCancel();
                      })(inputElement);
              }
            })
            .off('keydown')
            .on('keydown', function (keyboardEvent) {
              return 'Enter' == map[keyboardEvent.keyCode || keyboardEvent.which]
                ? ((blurHandled = !0), m(), !1)
                : 'Esc' == map[keyboardEvent.keyCode || keyboardEvent.which]
                  ? ((blurHandled = !0), onCancel(), !1)
                  : 'A' == map[keyboardEvent.keyCode || keyboardEvent.which] &&
                      (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
                    ? (g(!0), !1)
                    : void 0;
            })
            .off('mousedown')
            .on('mousedown', function (event) {
              event.stopPropagation();
            })
            .off('click')
            .on('click', function (event) {
              event.stopPropagation();
            })
            .off('dblclick')
            .on('dblclick', function (unusedParameter1) {
              if (this.selectionEnd == this.value.length) return g(), !1;
            })
            .on('focus', g);
      }
    };
  },
);
