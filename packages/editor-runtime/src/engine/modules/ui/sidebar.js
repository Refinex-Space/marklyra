// ui/sidebar.
export default function initializeUiSidebar(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(valueOrDefault, 'name', { value: 'x', configurable: true });

  if (!this) {
    self;
  }
  var suppressChanges,
    restoringDialogFocus,
    timerId,
    currentTimerId,
    utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    dialogs = (documentModel.TYPE, requireModule('ui/dialogs')),
    fileIntegration = requireModule('host/file-integration'),
    recovery = requireModule('document/recovery'),
    assetStorage = requireModule('media/asset-storage'),
    map = requireModule('editing/keyboard-shortcuts').map,
    fileTree = requireModule('ui/file-tree'),
    fileList = requireModule('ui/file-list'),
    quickOpen = requireModule('ui/quick-open'),
    fileSearchResults = requireModule('ui/file-search-results'),
    jquery = requireModule('libraries/jquery'),
    dragEnterCount = 0;
  function valueOrDefault(value, fallbackValue) {
    if (void 0 === value) {
      return fallbackValue;
    } else {
      return value;
    }
  }
  window._lastFocusTimeMark = new Date() - 0;
  window.onWindowFocusForNode = function (isAlreadyActive, isAlreadyFocused) {
    console.debug(
      `onWindowFocusForNode isAlreadyActive=${isAlreadyActive}, isAlreadyFocused=${isAlreadyFocused}`,
    );
    if (window.File && File.editor && File.editor.imgEdit) {
      if (!isAlreadyFocused) {
        File.freshMenu(true);
      }
      if (File._onFileSwitching) {
        console.sendLog('File.activeWindow = true');
        return void (File.activeWindow = true);
      }
      var fileSystem = reqnode('fs-plus');
      if (
        !restoringDialogFocus &&
        File.bundle.filePath &&
        !assetStorage.isFileSync(File.bundle.filePath)
      ) {
        console.debug('presentation file moved');
        return void recovery.onPresentationMoved();
      }
      if (File.getMountFolder()) {
        console.debug('check root change');
        if (!fileSystem.isDirectorySync(File.getMountFolder())) {
          File.editor.library.onRootChanged();
        }
      }
      if (!isAlreadyActive && File.editor.selection) {
        console.debug('!isAlreadyActive');
        JSBridge.invoke('document.getSnapWithValidation', File.bundle.lastSnapDate).then(
          (result) => {
            var { snap: documentSnapshot, shouldReadFromDisk: shouldReadFromDisk } =
              JSON.parse(result);
            handleWindowActivated(documentSnapshot, shouldReadFromDisk, true);
          },
        );
      } else {
        window._lastFocusTimeMark = new Date() - 0;
        File.editor.imgEdit.refreshLocalImg();
      }
    }
  };
  window.onWindowFocusForMac = function () {
    console.debug('onWindowFocusForMac');
    if (File.editor && File.editor.imgEdit) {
      File.freshMenu(true);
      File.editor.imgEdit.refreshLocalImg();
      File.editor.library.markOpenedFile(fileIntegration.getCurrentFilePath());
      window._lastFocusTimeMark = new Date() - 0;
      File.editor.tryEnterBusyModeWithDelay();
    }
  };
  var handleWindowActivated = Object.defineProperty(
    function (documentSnapshot, shouldReadFromDisk, preserveCursor, diskContentOverride) {
      console.sendLog('onBecomeActive');
      File.activeWindow = true;
      console.sendLog('File.activeWindow = true');
      if (!File._onInitParse) {
        File.editor.brush.clearAndPause();
        var lastCursor = preserveCursor ? File.editor.lastCursor : null,
          unchangedState = File.restoreEditStateFromData(
            documentSnapshot,
            preserveCursor,
            false,
            shouldReadFromDisk,
            diskContentOverride,
          );
        File.editor.brush.restart();
        if (!preserveCursor && File.isMac && documentSnapshot) {
          if (File.editor.library._onSwitchDocumentTarget) {
            if (currentTimerId) {
              clearTimeout(currentTimerId);
            }
            window.getSelection().removeAllRanges();
            currentTimerId = setTimeout(File.recoverPosOrScroll, 400);
          } else {
            File.recoverPosOrScroll();
          }
        } else {
          fileIntegration.refreshTitlebarText();
          if (unchangedState) {
            Reporter.record({
              message: 'Restore state from other window (no change)',
              category: 'window.focus',
            });
          } else {
            if (lastCursor) {
              File.editor.lastCursor = lastCursor;
              File.editor.restoreLastCursor();
              if (!File.editor.sourceView.inSourceMode) {
                var selection = window.getSelection();
                if (!(lastCursor && 'None' != selection.type)) {
                  selection.removeAllRanges();
                }
              }
            } else {
              window.getSelection().removeAllRanges();
            }
          }
        }
      }
    },
    'name',
    { value: 'C', configurable: true },
  );
  window.onWindowBlur = function () {
    try {
      if (!window.File || !File.editor || !File.editor.sourceView) {
        return;
      }
      if (File.isMac) {
        window.File.isLocked = true;
        File.backupDocumentSnap();
      }
    } catch (error) {
      console.sendError(error);
    } finally {
      return 'DONE';
    }
  };
  if (window.reqnode) {
    window.addEventListener('blur', function () {
      if (
        window.File &&
        File.editor &&
        File.editor.sourceView &&
        !window._onBackup &&
        File.isActiveWindow()
      ) {
        File.backupDocumentSnap();
      }
    });
    window.onWindowResignForNode = async () =>
      !!window.File &&
      (console.sendLog('window.onWindowResignForNode'),
      await File.backupDocumentSnap(),
      (File.activeWindow = false),
      console.sendLog('File.activeWindow = false'),
      true);
  }
  var localTimerId,
    switchToFile = Object.defineProperty(
      function (filePath, onSwitched) {
        if (!(File.isBroken || File._onInitParse || window._nos)) {
          if (
            (filePath = filePath || '').toLowerCase() != (File.bundle.filePath || '').toLowerCase()
          ) {
            fileIntegration.tryLeaveDocument(async function (cancelled) {
              if (cancelled) {
                File._onFileSwitching = false;
                return void File.editor.library.resumeOnChange();
              }
              File._onFileSwitching = true;
              await File.editor.library.doSwitchByNode(filePath);
              if (onSwitched) {
                onSwitched();
              }
            }, true);
          }
        }
      },
      'name',
      { value: 'S', configurable: true },
    ),
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
      this.editor = editor;
      this.root;
      this.items;
      this.fsWatcher;
      this.watchedFolder;
      this.unixWatchers = {};
      this.fileTree = new fileTree(this);
      this.fileList = new fileList(this);
      this.fileSearch = new fileSearchResults(this);
      this.outline = new quickOpen(this);
      this.useTreeStyle = File.option.useTreeStyle;
      this.supportResize_;
      this.onInit_ = true;
      this.cursorBackups = {};
      this.SortType = SortType;
      this.bindLiveResize();
      this.registerBridge();
      this.defaultTab = File.option.sidebarTab || (File.isMac ? 'file-list' : 'outline');
      if (!File.option.initFilePath && File.mountFolder_) {
        this.defaultTab = 'files';
      }
      if ('outline' == this.defaultTab) {
        document.querySelector('#marklyra-sidebar').classList.add('active-tab-outline');
      } else {
        document.querySelector('#marklyra-sidebar').classList.add('active-tab-files');
      }
      if (File.isNode) {
        jquery('#reveal-folder-from-sidebar-menu').text(
          jquery.localize.getString('Reveal in File Explorer'),
        );
      }
      if (File.option.pinFolder) {
        this.setMountFolder(File.option.pinFolder, !!File.option.showSidebar, 'pinFolder');
        File.option.pinFolder = void 0;
      }
      this.draggingItem = null;
      this.filesInDragging = [];
      if (File.option.showSidebar) {
        File.option.sidebarTab = 'files';
        setTimeout(() => {
          File.option.sidebarTab = 'files';
          this.showSidebar('files');
        }, 100);
      }
      setTimeout(() => {
        document.body.classList.remove('no-animation');
      }, 1e3);
    }
    async doSwitchByNode(filePath) {
      File.draftsRecoverList = [];
      if (!this.isDiscardableUntitled()) {
        await File.buildDocumentSnapForNode(true);
      }
      if (filePath) {
        await File.loadFile(filePath, true);
      } else {
        await JSBridge.invoke('document.switchToUntitled', void 0, true);
      }
      window.uploadImageQueue.clear();
      window.moveImageQueue.clear();
      File._onFileSwitching = false;
    }
    registerBridge() {
      if (File.isMac) {
        var receiver = this;
        bridge.registerHandler('library.onRootChanged', function (folderPath, respond) {
          receiver.onRootChanged(folderPath);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('library.scheduleChangeHighlight', function (filePath, respond) {
          receiver.scheduleChangeHighlight(filePath);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('library.onFileChanges', function (fileChanges, respond) {
          receiver.onFileChanges(fileChanges);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('library.onLoadFolderFailed', function (silent, respond) {
          receiver.onLoadFolderFailed(silent);
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('library.setFilesInDragging', function (dragPayload, respond) {
          receiver.filesInDragging = dragPayload[0];
          receiver.draggingItem = dragPayload[1] ? dragPayload[0][0] : null;
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('library.refreshOnRefocus', function () {
          if (receiver.isFileTabShown() && receiver.useTreeStyle) {
            receiver.refreshPanelCommand();
          }
        });
        bridge.registerHandler('library.getActiveTab', function (unusedParameter1, respond) {
          respond(receiver.getActiveTab());
        });
        bridge.registerHandler('window.onBecomeActive', function (restorePayload, respond) {
          if (restorePayload[1]) {
            File.setDocumentState(restorePayload[1]);
          }
          handleWindowActivated(
            restorePayload[0],
            (restorePayload[0] || {}).isOutDated,
            restorePayload[2],
            restorePayload[3],
          );
          if (respond) {
            respond();
          }
        });
      }
    }
    supportResize() {
      if (void 0 === this.supportResize_) {
        this.supportResize_ = !(
          !window.CSS ||
          !window.CSS.supports ||
          (!window.CSS.supports('--sidebar-width', 0) && !window.CSS.supports('(--foo: red)'))
        );
        return this.supportResize_;
      } else {
        return this.supportResize_;
      }
    }
    bindLiveResize() {
      var element = jquery('#marklyra-sidebar-resizer'),
        receiver = this,
        sidebarWidth = File.option.sidebarWidth;
      if (sidebarWidth) {
        this.setSidebarWidth(sidebarWidth - 0, false);
      }
      if (this.supportResize()) {
        var mousePressed,
          maxWidth,
          hideOnRelease,
          dragging = false;
        element
          .on('mousedown', function (pointerEvent) {
            if (1 === pointerEvent.which) {
              mousePressed = true;
            }
          })
          .on('mousemove', function (pointerEvent) {
            if (1 === pointerEvent.which && mousePressed) {
              if (!dragging) {
                dragging = true;
                element.addClass('dragging');
                maxWidth = window.innerWidth - 220;
              }
              if (pointerEvent.pageX < 100) {
                element.children().css('left', 0);
                hideOnRelease = true;
              } else {
                hideOnRelease = false;
                var previewWidth = Math.min(Math.max(160, pointerEvent.pageX), maxWidth);
                element.children().css('left', previewWidth);
              }
            }
          })
          .on('mouseup', function (pointerEvent) {
            if (dragging) {
              mousePressed = false;
              dragging = false;
              element.removeClass('dragging');
              element.children().css('left', '');
              if (pointerEvent.pageX < 100) {
                receiver.hideSidebar();
              } else {
                var sidebarWidth = Math.min(Math.max(160, pointerEvent.pageX), maxWidth);
                receiver.setSidebarWidth(sidebarWidth, true);
              }
            }
          });
        jquery(window).on('mouseup', function () {
          if (dragging) {
            mousePressed = false;
            dragging = false;
            element.removeClass('dragging');
            element.children().css('left', '');
            if (hideOnRelease) {
              receiver.hideSidebar();
            }
          }
        });
      } else {
        console.debug('does not support resize sidebar');
        element.remove();
      }
    }
    listenCurrentTransition() {
      if (!File.isNode) {
        return void window.dispatchEvent(new Event('resize'));
      }
      var element = document.querySelector('#marklyra-sidebar');
      const notifyTransitionStart = Object.defineProperty(
          function () {
            window.dispatchEvent(new Event('resize'));
          },
          'name',
          { value: 't', configurable: true },
        ),
        notifyTransitionEnd = Object.defineProperty(
          function () {
            window.dispatchEvent(new Event('optimizedResize'));
            element.removeEventListener('transitionstart', notifyTransitionStart);
            element.removeEventListener('transitionend', notifyTransitionEnd);
          },
          'name',
          { value: 'n', configurable: true },
        );
      element.addEventListener('transitionstart', notifyTransitionStart);
      element.addEventListener('transitionend', notifyTransitionEnd);
    }
    setSidebarWidth(width, persist) {
      if (File.isNode) {
        window.dispatchEvent(new Event('beforeResize'));
      }
      if (width) {
        width = Math.max(width, 160);
      }
      var cssWidth = width ? width + 'px' : '';
      document.documentElement.style.setProperty('--sidebar-width', cssWidth);
      if (File.isMac) {
        if (
          'true' !=
            (
              window
                .getComputedStyle(document.body)
                .getPropertyValue('--marklyra-center-window-title') || ''
            ).trim() &&
          document.body.classList.contains('pin-outline')
        ) {
          bridge.callHandler('window.setTitlebarTextMarginLeft', width);
        } else {
          bridge.callHandler('window.setTitlebarTextMarginLeft', null);
        }
      }
      if (persist) {
        setTimeout(function () {
          JSBridge.putSetting('sidebar-width', width);
        }, 10);
      }
      this.listenCurrentTransition();
    }
    isSuppressOnChange() {
      return suppressChanges;
    }
    markFocusOnDialogClose() {
      restoringDialogFocus = true;
      setTimeout(function () {
        restoringDialogFocus = false;
      }, 200);
    }
    pauseOnChange(autoResume, filePath) {
      if ((suppressChanges = !filePath || this.findElemFromPath(filePath).length) && autoResume) {
        setTimeout(
          function () {
            suppressChanges = false;
          },
          File.isMac ? 800 : 200,
        );
      }
    }
    resumeOnChange() {
      suppressChanges = false;
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
      if (this.isSidebarShown()) {
        if (this.isFileTabShown()) {
          if (this.useTreeStyle) {
            return 'file-tree';
          } else {
            return 'file-list';
          }
        } else {
          return 'outline';
        }
      } else {
        return '';
      }
    }
    togglePanel(tabName) {
      if (this.getActiveTab() != tabName || this.fileSearch.isActive()) {
        this.showSidebar(tabName);
      } else {
        this.toggleSidebar();
      }
    }
    toggleSidebar() {
      if (this.isSidebarShown()) {
        this.hideSidebar();
      } else {
        this.showSidebar();
      }
    }
    tmpHideSidebar(persistHidden) {
      this.savedSidebarStatus = this.isSidebarShown();
      this.outline.autoHideOutline();
      this.hideSidebar(!persistHidden);
    }
    recoverSidebar() {
      if (this.savedSidebarStatus) {
        this.showSidebar();
      }
      this.savedSidebarStatus = void 0;
    }
    updateMenu(tabName) {
      var menuStates = {};
      menuStates['View→Outline'] = { state: 'outline' == tabName };
      menuStates['View→Articles'] = { state: 'file-list' == tabName };
      menuStates['View→File Tree'] = { state: 'file-tree' == tabName };
      menuStates['View→Search'] = { state: 'search' == tabName };
      JSBridge.menu.update(menuStates);
    }
    hideSidebar(preserveSetting) {
      if (File.isNode) {
        window.dispatchEvent(new Event('beforeResize'));
      }
      this.outline.storeOutline();
      document.querySelector('#marklyra-sidebar').classList.remove('open');
      document.body.classList.remove('pin-outline');
      if (!preserveSetting) {
        JSBridge.putSetting('sidebar_tab', '');
      }
      this.listenCurrentTransition();
      if (File.isMac) {
        bridge.callHandler('window.setTitlebarTextMarginLeft', null);
        this.updateMenu('');
      } else {
        window.ClientCommand.refreshViewMenu();
      }
    }
    showSidebar(tabName, keepCurrentTab) {
      if (this.fileSearch.isActive()) {
        this.fileSearch.hide();
      }
      this.outline.autoHideOutline();
      if (this.isSidebarShown()) {
        if (tabName && !keepCurrentTab) {
          this.switch(tabName);
        }
      } else {
        this.show(tabName);
      }
    }
    show(tabName) {
      if (File.isNode) {
        window.dispatchEvent(new Event('beforeResize'));
      }
      document.querySelector('#marklyra-sidebar').classList.add('open');
      document.body.classList.add('pin-outline');
      this.switch(tabName || this.getActiveTab() || this.defaultTab);
      this.outline.renderOutline();
      this.listenCurrentTransition();
      if (
        File.isMac &&
        'true' !=
          (
            window
              .getComputedStyle(document.body)
              .getPropertyValue('--marklyra-center-window-title') || ''
          ).trim()
      ) {
        bridge.callHandler(
          'window.setTitlebarTextMarginLeft',
          document.querySelector('#marklyra-sidebar').getBoundingClientRect().width,
        );
      }
    }
    updateOption() {
      var delegate = this.getDelegate(),
        sortType = valueOrDefault(delegate.sortType, this.sortType());
      delegate.setGroupByFolder(delegate.noGroup);
      this.setSortType(sortType);
    }
    switchTreeOrList(useTreeStyle) {
      if (this.useTreeStyle !== useTreeStyle || this.onInit_) {
        this.onInit_ = false;
        this.useTreeStyle = useTreeStyle;
        jquery('.sidebar-content').scrollTop(0);
        if (this.useTreeStyle) {
          jquery('#marklyra-sidebar')
            .addClass('use-file-tree-style')
            .removeClass('use-file-list-style')
            .find('#sidepanel-segmented-input-files')
            .data('localize', 'Files')
            .text(jquery.localize.getString('Files'));
        } else {
          jquery('#marklyra-sidebar')
            .addClass('use-file-list-style')
            .removeClass('use-file-tree-style')
            .find('#sidepanel-segmented-input-files')
            .data('localize', 'Articles')
            .text(jquery.localize.getString('Articles'));
        }
        if (!jquery.localize.isLoaded()) {
          jquery('#sidepanel-segmented-input-files').localize('Front', {
            language: File.language,
            pathPrefix: 'locales',
          });
        }
        if (File.isNode) {
          window.ClientCommand.refreshViewMenu();
        } else {
          this.updateMenu(useTreeStyle ? 'file-tree' : 'file-list');
        }
        JSBridge.putSetting('useTreeStyle', useTreeStyle);
      }
      if (this.isFileTabShown() && !this.renderIfNeed()) {
        this.markCurrentFile(true);
      }
      jquery('[data-side-mode]').removeClass('selected-folder-menu-item');
      if (this.useTreeStyle) {
        jquery("[data-side-mode='file-tree']").addClass('selected-folder-menu-item');
      } else {
        jquery("[data-side-mode='file-list']").addClass('selected-folder-menu-item');
      }
      this.updateOption();
      this.refreshMenuVisibility();
      JSBridge.putSetting('sidebar_tab', useTreeStyle ? 'file-tree' : 'file-list');
    }
    backupCursor() {
      if (File.bundle.filePath) {
        var cursorSnapshot = this.editor.selection.storeToJson() || {},
          inSourceMode = File.editor.sourceView.inSourceMode;
        cursorSnapshot.scrollOffset = inSourceMode ? 0 : jquery('content').scrollTop();
        cursorSnapshot.date = new Date();
        this.cursorBackups[File.bundle.filePath] = cursorSnapshot;
      }
    }
    openFile(filePath, onOpened) {
      if (!this._onSwitchDocumentTarget && !File._onFileSwitching && !window._nos) {
        if (!onOpened) {
          window._hasSwitchCallback = false;
        }
        var receiver = this;
        if (filePath && !File.isBroken) {
          jquery('#sidebar-files-menu').trigger('blur');
          if (this.editor.searchPanel) {
            this.editor.searchPanel.resetSearchStatus(null);
          }
          this.backupCursor();
          if (File.isMac) {
            this._onSwitchDocumentTarget = true;
            bridge.callHandler('controller.switchDocumentTarget', filePath, function (opened) {
              receiver._onSwitchDocumentTarget = false;
              if (onOpened) {
                onOpened(opened);
              }
              if (!opened) {
                receiver.refreshPanelCommand();
              }
            });
            setTimeout(() => {
              receiver._onSwitchDocumentTarget = false;
            }, 200);
          } else {
            File.megaMenu.hide();
            switchToFile(filePath, onOpened);
          }
          Analytics.record('openFile', { format: (/\.[^.\\\/]+$/.exec(filePath) || [''])[0] });
        }
      }
    }
    openWithCtrl(filePath, isDirectory) {
      this.openFileInNewWindow(filePath, isDirectory);
    }
    openFileInNewWindow(filePath, isDirectory) {
      if (filePath) {
        File.backupDocumentSnap().then(function () {
          if (File.isMac) {
            if (isDirectory) {
              bridge.callHandler('controller.openFolder', filePath);
            } else {
              bridge.callHandler('controller.openInNewWindow', filePath);
            }
          } else {
            JSBridge.invoke('app.openFileOrFolder', filePath, {
              forceCreateWindow: !File.bundle.filePath || filePath === File.bundle.filePath,
              mountFolder: File.getMountFolder(),
            });
          }
        });
      }
    }
    onLoadFolderFailed(silent) {
      silent = silent || this.silent;
      var receiver = this;
      if (File.option.pinFolder && File.mountFolder_ == File.option.pinFolder) {
        File.option.pinFolder = void 0;
        this.silent = 'pinFolder';
      }
      if ('pinFolder' == this.silent) {
        JSBridge.invoke('dialog.showMessageBox', {
          type: 'question',
          message: jquery.localize.getString('Cannot open folder {0}').format(File.mountFolder_),
          buttons: [
            jquery.localize.getString('Choose Default Folder', 'Panel'),
            jquery.localize.getString('Ignore', 'Panel'),
          ],
          defaultId: 0,
          cancelId: 1,
          normalizeAccessKeys: true,
        }).then(({ response: buttonIndex }) => {
          JSBridge.putSetting('restoreWhenLaunch', 0);
          JSBridge.putSetting('pinFolder', '');
          if (0 == buttonIndex) {
            JSBridge.invoke('dialog.showOpenDialog', {
              defaultPath: File.mountFolder_ || '',
              properties: ['openDirectory', 'promptToCreate'],
            }).then(({ filePaths: filePaths }) => {
              if (filePaths && filePaths.length > 0) {
                JSBridge.putSetting('restoreWhenLaunch', 3);
                JSBridge.putSetting('pinFolder', filePaths[0]);
                receiver.setMountFolder(filePaths[0]);
              }
            });
          }
        });
      } else {
        if (!silent) {
          alert(jquery.localize.getString('Cannot open folder {0}').format(File.mountFolder_));
        }
      }
      if (File.isNode) {
        JSBridge.invoke('setting.removeRecentFolder', File.getMountFolder());
      }
      jquery('#file-library-tree, #file-library-list-children').attr('data-state', '').html('');
      File.mountFolder_ = null;
      this.root = null;
      this.silent = false;
      this.refreshMenuVisibility();
    }
    addWatch(fsWatcher) {
      if (!(this.fsWatcher && fsWatcher && fsWatcher == this.watchedFolder)) {
        if (File.isWin) {
          this.addFolderWatchByWin(fsWatcher);
        } else {
          this.addWatchByUnix(fsWatcher);
        }
      }
    }
    unwatchByUnix(searchValue) {
      if ((File.isLinux || File.isMacNode) && searchValue) {
        for (var watchedPath in this.unixWatchers) {
          if (-1 == watchedPath.indexOf(searchValue)) {
            if (this.unixWatchers[watchedPath]) {
              this.unixWatchers[watchedPath].close();
            }
            this.unixWatchers[watchedPath] = null;
          }
        }
      }
    }
    addWatchByUnix(folderPath) {
      Object.defineProperty(applyAddedFileChanges, 'name', { value: 'i', configurable: true });

      if ((File.isLinux || File.isMacNode) && folderPath) {
        var receiver = this,
          watcher = this.unixWatchers[folderPath];
        try {
          if (watcher) {
            watcher.close();
            watcher = null;
          }
          this.unixWatchers[folderPath] = reqnode('fs').watch(
            folderPath,
            function (eventType, fileName) {
              !(function (eventType, filePath) {
                if (!(receiver.isSuppressOnChange() || receiver.shouldIgnore(filePath))) {
                  if (timerId) {
                    clearTimeout(timerId);
                  }
                  items.push([filePath, eventType]);
                  timerId = setTimeout(applyAddedFileChanges, 200);
                }
              })(eventType, folderPath + '/' + fileName);
            },
          );
        } catch (error) {
          console.warn(error);
        }
      }
      function applyAddedFileChanges() {
        console.debug('applyFileChanges');
        if (!receiver.isSuppressOnChange()) {
          var currentItems = items.clone();
          timerId = null;
          items = [];
          var treeChanges = [],
            listChanges = [];
          currentItems.forEach(function (item) {
            receiver.fileTree.onChangeForWin(item[0], treeChanges, item[1]);
            receiver.fileList.onChangeForWin(item[0], 'change' == item[1], listChanges);
          });
        }
      }
    }
    addFolderWatchByWin(watchedFolder, unusedParameter2) {
      Object.defineProperty(applyRemovedFileChanges, 'name', { value: 'r', configurable: true });

      var receiver = this;
      if (this.fsWatcher) {
        this.fsWatcher.close();
        this.fsWatcher = null;
        this.watchedFolder = null;
      }
      if (watchedFolder) {
        console.debug('add folder watch ' + watchedFolder);
        try {
          this.watchedFolder = watchedFolder;
          this.fsWatcher = reqnode('fs').watch(
            watchedFolder,
            { recursive: true },
            function (eventType, changedPath) {
              if (!suppressChanges) {
                changedPath = watchedFolder + '\\' + changedPath;
                if (
                  'rename' == eventType &&
                  File.bundle.filePath &&
                  0 == File.bundle.filePath.indexOf(changedPath + '\\')
                ) {
                  var renamedPath =
                    changedPath + '\\' + File.bundle.filePath.substr(changedPath.length);
                  window.doApplyRename(renamedPath);
                }
                !(function (filePath, isContentChange) {
                  if (localTimerId) {
                    clearTimeout(localTimerId);
                  }
                  items.push([filePath, isContentChange]);
                  localTimerId = setTimeout(applyRemovedFileChanges, 200);
                })(changedPath, 'rename' !== eventType);
              }
            },
          );
        } catch (error) {
          console.warn(error);
        }
      }
      function applyRemovedFileChanges() {
        console.debug('applyFileChanges');
        var currentItems = items.clone();
        localTimerId = null;
        items = [];
        var treeChanges = [],
          listChanges = [];
        currentItems.forEach(function (item) {
          if (!item[1]) {
            receiver.fileTree.onChangeForWin(item[0], treeChanges);
          }
          receiver.fileList.onChangeForWin(item[0], item[1], listChanges);
        });
      }
    }
    bindContext() {
      Object.defineProperty(showFileContextMenu, 'name', { value: 'n', configurable: true });
      Object.defineProperty(positionSidebarContextMenu, 'name', { value: 'i', configurable: true });

      var currentReceiver,
        receiver = this;
      function showFileContextMenu(contextEvent) {
        currentReceiver = this;
        if (this == document.querySelector('#file-library') && receiver.useTreeStyle) {
          if (contextEvent.target != this || !File.editor.library.root) {
            return false;
          }
          currentReceiver = receiver.findElemFromPath(File.editor.library.root.path)[0];
          jquery('#file-menu')
            .children('li')
            .hide()
            .end()
            .find('[data-action="new_file"],[data-action="new_folder"]')
            .show();
        } else {
          jquery('#file-menu li').show();
        }
        File.sync();
        receiver.editor.lastCursor = receiver.editor.selection.buildUndo();
        jquery('#write').blur();
        jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
        var element = jquery(currentReceiver)
            .closest('.file-library-node, .marklyra-search-item')
            .focus(),
          fileMenu = jquery('#file-menu').addClass('show');
        if (File.isWin) {
          fileMenu.find('[for-win]').show();
        }
        fileMenu.find('li[data-key], .divider').show();
        if (jquery('#marklyra-sidebar.marklyra-show-search').length) {
          fileMenu.find("[data-action='search'] a").addClass('state-on');
        } else {
          fileMenu.find("[data-action='search'] a").removeClass('state-on');
        }
        if (element.hasClass('marklyra-search-item')) {
          fileMenu.find('li[data-key], .divider').hide();
          fileMenu.find('[for-search]').show();
        } else {
          fileMenu.find('[for-search-only]').hide();
          if (receiver.useTreeStyle) {
            fileMenu.find('[data-action="new_folder"]').show();
            if (element.attr('data-path') == File.getMountFolder()) {
              fileMenu.find('[for-file]').hide();
            } else {
              if ('true' == element.attr('data-is-directory')) {
                fileMenu.find('[for-file]:not([for-folder])').hide();
              } else {
                fileMenu.find('[for-folder]:not([for-file])').hide();
              }
            }
          } else {
            fileMenu.find('[data-action="new_folder"]').hide();
            fileMenu.find('[for-folder]:not([for-file])').hide();
            if (
              !receiver.editor
                .getJQueryElem(currentReceiver)
                .closest('.file-library-node')
                .attr('data-path')
            ) {
              fileMenu.find('[for-folder],[for-file]').hide();
            }
          }
          if (!File.isWin) {
            fileMenu.find('[for-win]').hide();
          }
        }
        var mountFolder = File.getMountFolder();
        mountFolder = mountFolder ? mountFolder + (File.isWin ? '\\' : '/') : '';
        fileMenu.find('[for-undo]').hide();
        if (File.isNode) {
          JSBridge.invoke('filesOp.undoLabel', mountFolder).then((result) => {
            if (result) {
              var undoLabel = jquery.localize.getString('Undo %@', 'Panel').replace('%@', result);
              fileMenu.find('[data-action="undo_file_op"] a').text(undoLabel);
              fileMenu.find('[for-undo]').show();
            }
          });
        }
        if (receiver.useTreeStyle) {
          fileMenu.find('[data-action="list_view"] a').removeClass('state-on');
          fileMenu.find('[data-action="tree_view"] a').addClass('state-on');
        } else {
          fileMenu.find('[data-action="list_view"] a').addClass('state-on');
          fileMenu.find('[data-action="tree_view"] a').removeClass('state-on');
        }
        if (receiver.isReadOnlyRoot()) {
          jquery('#file-menu').find('[for-new]').hide();
        } else {
          jquery('#file-menu').find('[for-new]').show();
        }
        positionSidebarContextMenu(contextEvent, fileMenu);
        element.one('blur', function () {
          if (
            !(
              document.activeElement &&
              document.activeElement.classList.contains('file-node-content')
            )
          ) {
            jquery('.context-menu').removeClass('show');
          }
        });
        return false;
      }
      function positionSidebarContextMenu(pointerEvent, menuElement) {
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
        if (attributeValue && 1 == pointerEvent.which) {
          jquery('.context-menu').removeClass('show').find('.active').removeClass('active');
          setTimeout(function () {
            switch (attributeValue) {
              case 'open':
                receiver.openFileCommand(currentReceiver);
                break;
              case 'open_in_new_window':
                receiver.openFileInNewWindowCommand(currentReceiver);
                break;
              case 'new_file':
                receiver.newFileCommand(currentReceiver);
                return false;
              case 'new_folder':
                receiver.newFolderCommand(currentReceiver);
                return false;
              case 'delete':
                receiver.deleteFileCommand(currentReceiver);
                break;
              case 'properties':
                receiver.showFilePropertyCommand(currentReceiver);
                return false;
              case 'rename':
                receiver.getDelegate().renameFileCommand(currentReceiver);
                return false;
              case 'duplicate':
                receiver.duplicateFileCommand(currentReceiver);
                return false;
              case 'copy_path':
                receiver.copyFullPathCommand(currentReceiver);
                break;
              case 'reveal':
                receiver.revealFileInFinderCommand(currentReceiver);
                break;
              case 'undo_file_op':
                if (File.isNode) {
                  JSBridge.invoke('filesOp.getFocusPath').then((result) => {
                    if (result) {
                      receiver.scheduleChangeHighlight(result);
                    }
                    JSBridge.invoke('filesOp.performUndo');
                  });
                }
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
                if (
                  !receiver.fileSearch.isActive() &&
                  jquery('#marklyra-sidebar.marklyra-show-search').length
                ) {
                  receiver.fileSearch.hideSearch();
                } else {
                  receiver.fileSearch.toggleSearch();
                }
                break;
              default:
                return;
            }
          }, 0);
          receiver.editor.restoreLastCursor(null, true);
        }
      });
      jquery('#file-library')
        .on('contextmenu', '.file-node-content, .file-list-item', showFileContextMenu)
        .on('contextmenu', showFileContextMenu);
      jquery('#file-library-search')
        .on('contextmenu', '.marklyra-search-item', showFileContextMenu)
        .on('contextmenu', function (contextEvent) {
          var fileMenu = jquery('#file-menu').addClass('show');
          fileMenu.find('li').hide();
          fileMenu
            .find('[data-action="search"]')
            .show()
            .find('a')
            .addClass('state-on')
            .parent()
            .next()
            .show();
          fileMenu.find('[data-action="expand_all"], [data-action="collapse_all"]').show();
          positionSidebarContextMenu(contextEvent, fileMenu);
          return false;
        });
    }
    clearDraggingItem() {
      this.setDraggingItem(null);
      jquery('.marklyra-on-drag-enter').removeClass('marklyra-on-drag-enter');
    }
    setDraggingItem(draggingItem, isDirectory, event) {
      this.draggingItem = draggingItem;
      if (null == draggingItem) {
        dragEnterCount = 0;
      } else {
        if (File.isNode) {
          if (!draggingItem) {
            return;
          }
          var dragIconPath =
            window.dirname +
            (isDirectory ? '/style/windows-folder-icon.png' : '/style/marklyra-file-icon.png');
          reqnode('electron').ipcRenderer.send('ondragstart', draggingItem, dragIconPath);
          if (event) {
            event.preventDefault();
          }
        } else {
          if (File.isMac) {
            bridge.callHandler('controller.startDrag', draggingItem);
          }
        }
      }
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
      Object.defineProperty(hideSidebarFooterMenu, 'name', { value: 'r', configurable: true });
      Object.defineProperty(startDragScrolling, 'name', { value: 'a', configurable: true });
      Object.defineProperty(stopDragScrolling, 'name', { value: 's', configurable: true });

      var currentParentElement,
        receiver = this,
        editor = this.editor,
        sidebarElement = jquery('#marklyra-sidebar');
      function hideSidebarFooterMenu() {
        jquery('.show-sidebar-footer-context').removeClass('show-sidebar-footer-context');
      }
      var scrollDragCount = 0;
      function startDragScrolling(scrollUp) {
        if (!receiver.strollingBySelect) {
          receiver.strollingBySelect = true;
          var scrollContainer = jquery('#sidebar-content'),
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
      }
      function stopDragScrolling() {
        scrollDragCount = 0;
        if (receiver.strollingBySelect) {
          jquery('#sidebar-content').stop(true);
          receiver.strollingBySelect = false;
        }
      }
      jquery('#sidepanel-segmented-input-files').click(function () {
        receiver.switch('files', true);
      });
      jquery('#sidepanel-segmented-input-outline').click(function () {
        receiver.switch('outline', true);
      });
      sidebarElement
        .on('keydown', '[tabindex]', function (keyboardEvent) {
          if (
            'Esc' == map[keyboardEvent.keyCode || keyboardEvent.which] &&
            receiver.editor.focusCid
          ) {
            receiver.editor.restoreLastCursor(null, true);
          }
        })
        .on('mousedown', '[tabindex]', function (pointerEvent) {
          if ('INPUT' != pointerEvent.target.tagName) {
            var lastCursor = receiver.editor.selection.buildUndo();
            if (lastCursor) {
              receiver.editor.lastCursor = lastCursor;
            }
          }
        });
      sidebarElement
        .on('dragstart', '.file-node-content', function (dragEvent) {
          if ('INPUT' != document.activeElement.tagName) {
            var parentElement = this.parentElement,
              path = parentElement.dataset.path;
            receiver.setDraggingItem(
              path,
              parentElement.dataset.isDirectory + '' == 'true',
              dragEvent,
            );
            dragEvent.originalEvent.dataTransfer.setData('file', path);
            dragEvent.originalEvent.dataTransfer.setData('text/plain', path);
          }
        })
        .on('dragenter', "[data-is-directory='true'] > .file-node-content", function (event) {
          Object.defineProperty(scheduleFolderDragHighlight, 'name', {
            value: 'i',
            configurable: true,
          });
          Object.defineProperty(scheduleFolderDragExpansion, 'name', {
            value: 'r',
            configurable: true,
          });

          function scheduleFolderDragHighlight(delayMs) {
            setTimeout(function () {
              if (
                parentElement.classList.contains('marklyra-on-drag-enter') &&
                parentElement == currentParentElement
              ) {
                jquery(parentElement)
                  .addClass('file-node-collapsed')
                  .removeClass('file-node-expanded');
                scheduleFolderDragExpansion(5e3);
              }
            }, delayMs || 1e3);
          }
          function scheduleFolderDragExpansion(delayMs) {
            setTimeout(function () {
              if (
                parentElement.classList.contains('marklyra-on-drag-enter') &&
                parentElement == currentParentElement
              ) {
                receiver.fileTree.expandNode(
                  jquery(parentElement),
                  parentElement.dataset.path,
                  function () {
                    scheduleFolderDragHighlight(5e3);
                  },
                );
              }
            }, delayMs || 1e3);
          }
          dragEnterCount++;
          event.stopPropagation();
          event.preventDefault();
          var dataTransfer = event.originalEvent.dataTransfer;
          if (File.isWK && !receiver.draggingItem) {
            receiver.draggingItem = dataTransfer.getData('file');
          }
          if (receiver.draggingItem || (dataTransfer.types || []).indexOf('Files') > -1) {
            var parentElement = this.parentElement;
            setTimeout(function () {
              currentParentElement = parentElement;
            }, 0);
            jquery(this).closest('.marklyra-on-drag-enter').removeClass('marklyra-on-drag-enter');
            if (
              !(true !== parentElement.dataset.hasSub && 'true' != parentElement.dataset.hasSub)
            ) {
              if (parentElement.classList.contains('file-node-expanded')) {
                scheduleFolderDragHighlight(3e3);
              } else {
                scheduleFolderDragExpansion();
              }
            }
            jquery('.marklyra-on-drag-enter').removeClass('marklyra-on-drag-enter');
            parentElement.classList.add('marklyra-on-drag-enter');
          }
        })
        .on(
          'dragleave',
          '.marklyra-on-drag-enter > .file-node-content',
          function (unusedParameter1) {
            dragEnterCount--;
            currentParentElement = null;
          },
        )
        .on('dragleave', ".marklyra-on-drag-enter[data-is-directory='true']", function (event) {
          if (!(dragEnterCount > 0)) {
            var domNode = event.target;
            if (domNode.classList.contains('file-node-content')) {
              domNode = domNode.parentElement;
            }
            if (domNode.classList.contains('marklyra-on-drag-enter')) {
              domNode.classList.remove('marklyra-on-drag-enter');
              event.stopPropagation();
            }
          }
        })
        .on('drop', "[data-is-directory='true']", function (event) {
          event.stopPropagation();
          event.preventDefault();
          var currentItems = [],
            dataTransfer = event.originalEvent.dataTransfer;
          if (File.isActiveWindow()) {
            if (receiver.draggingItem) {
              currentItems.push(receiver.draggingItem);
            } else {
              if (dataTransfer.files && dataTransfer.files.length) {
                if (!MediaOp.getPathForFile(dataTransfer.files.item(0))) {
                  currentItems = receiver.filesInDragging || [];
                }
                if (File.isNodeHtml) {
                  for (var fileIndex = 0; fileIndex < dataTransfer.files.length; fileIndex++) {
                    var filePath = MediaOp.getPathForFile(dataTransfer.files.item(fileIndex));
                    if (filePath) {
                      currentItems.push(filePath);
                    }
                  }
                }
              } else {
                if (dataTransfer.getData('text/uri-list')) {
                  currentItems.push(
                    dataTransfer.getData('text/uri-list').replace(/^file:[\/]+/, ''),
                  );
                }
              }
            }
            receiver.clearDraggingItem();
            if (currentItems.length) {
              receiver.fileTree.expand(this.dataset.path);
              receiver.copyOrMoveFiles(currentItems, this.dataset.path);
            }
          }
        })
        .on('drop', function (event) {
          event.stopPropagation();
          event.preventDefault();
        })
        .on('mouseup', function () {
          receiver.clearDraggingItem();
          stopDragScrolling();
        });
      if (File.isMac) {
        sidebarElement
          .on('dragenter', '.sidebar-tabs', function (event) {
            event.preventDefault();
            scrollDragCount++;
            startDragScrolling(true);
          })
          .on('dragleave', '.sidebar-tabs', function (event) {
            event.preventDefault();
            if (!--scrollDragCount) {
              stopDragScrolling();
            }
          })
          .on('dragenter', '#marklyra-sidebar-footer', function (event) {
            event.preventDefault();
            scrollDragCount++;
            startDragScrolling(false);
          })
          .on('dragleave', '#marklyra-sidebar-footer', function (event) {
            event.preventDefault();
            if (!--scrollDragCount) {
              stopDragScrolling();
            }
          });
      }
      jquery('#marklyra-sidebar-footer')
        .on('click', '#sidebar-new-file-btn', function () {
          editor.focusAndRestorePos();
          receiver.newFile(File.getMountFolder());
          return false;
        })
        .on('click', '#switch-file-list-btn', function () {
          editor.focusAndRestorePos();
          receiver.switchTreeOrList(!receiver.useTreeStyle);
          return false;
        })
        .on('click', '#target-cur-file-btn', function () {
          editor.focusAndRestorePos();
          if (File.getMountFolder()) {
            receiver.getDelegate().focusToFile(fileIntegration.getCurrentFilePath());
          }
          return false;
        })
        .on('mousedown', '#sidebar-menu-btn .sidebar-footer-item', function () {
          editor.focusAndRestorePos();
          if (jquery('.show-sidebar-footer-context').length) {
            hideSidebarFooterMenu();
          } else {
            receiver.showSidebarMenu();
          }
          return false;
        });
      jquery('.sidebar-tabs')
        .on('click', '#hide-sidebar-btn', function () {
          editor.focusAndRestorePos();
          receiver.hideSidebar();
          return false;
        })
        .on('click', '#switch-sidebar-icon', function () {
          editor.focusAndRestorePos();
          receiver.switch(receiver.isFileTabShown() ? 'outline' : 'files');
          return false;
        });
      jquery('#sidebar-files-menu')
        .on('blur', function () {
          setTimeout(hideSidebarFooterMenu, 10);
        })
        .on('mousedown', '#close-sidebar-menu-btn', function () {
          hideSidebarFooterMenu();
        })
        .on('mousedown', '#new-file-from-sidebar-menu', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            receiver.newFile(File.getMountFolder());
          }
        })
        .on('mousedown', '#reveal-folder-from-sidebar-menu', function (pointerEvent) {
          if (1 == pointerEvent.which && File.getMountFolder()) {
            JSBridge.openFolder(File.getMountFolder());
          }
        })
        .on('mousedown', '#search-from-sidebar-menu', function (pointerEvent) {
          if (1 == pointerEvent.which && File.getMountFolder()) {
            receiver.fileSearch.show(true);
          }
        })
        .on('mousedown', '#refresh-from-sidebar-menu', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            receiver.refreshPanelCommand();
          }
        })
        .on('mousedown', '#open-folder-from-sidebar-menu', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            jquery('#sidebar-files-menu').trigger('blur');
            setTimeout(receiver.selectFolder.bind(receiver), 100);
          }
        })
        .on('mousedown', '[data-side-mode]', function (pointerEvent) {
          if (1 == pointerEvent.which) {
            receiver.switch(this.getAttribute('data-side-mode'));
          }
        })
        .on('mousedown', '.sidebar-folder-pin', async function (event) {
          event.stopPropagation();
          event.preventDefault();
          if (1 == event.which) {
            var element = jquery(this).closest('.folder-menu-item'),
              isPinned = 'true' == element.attr('data-pinned'),
              path = element.attr('data-path');
            await JSBridge.invoke('setting.updateRecentFile', {
              path: path,
              pinned: !isPinned,
            });
            receiver.showSidebarMenu();
          }
        })
        .on('mousedown', '.sidebar-folder-remove', function (event) {
          event.stopPropagation();
          event.preventDefault();
          if (1 == event.which) {
            var element = jquery(this).closest('.folder-menu-item');
            JSBridge.invoke('setting.removeRecentFolder', element.attr('data-path'));
            element.remove();
          }
        })
        .on('mousedown', '.folder-menu-item', function (keyboardEvent) {
          if (1 == keyboardEvent.which) {
            if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
              receiver.openWithCtrl(this.getAttribute('data-path'), true);
            } else {
              if (File.getMountFolder() != this.getAttribute('data-path')) {
                JSBridge.invoke('controller.switchFolder', this.getAttribute('data-path'));
              }
            }
            hideSidebarFooterMenu();
          }
        })
        .on('mousedown', '#marklyra-group-by-folder-btn', function (unusedParameter1) {
          receiver.getDelegate().setGroupByFolder(!receiver.getDelegate().noGroup);
          return false;
        })
        .on('mousedown', '#marklyra-sort-by-natural-btn', function () {
          if (this.classList.contains('active')) {
            receiver.setSortType(receiver.sortType() ? SortType.Natural : SortType.NaturalDescend);
          } else {
            receiver.setSortType(
              this.classList.contains('marklyra-sort-by-natural-d')
                ? SortType.NaturalDescend
                : SortType.Natural,
            );
          }
          jquery(this).trigger('mouseenter');
          return false;
        })
        .on('mousedown', '#marklyra-sort-by-name-btn', function () {
          if (this.classList.contains('active')) {
            receiver.setSortType(-receiver.sortType());
          } else {
            receiver.setSortType(this.classList.contains('marklyra-sort-a') ? -1 : 1);
          }
          jquery(this).trigger('mouseenter');
          return false;
        })
        .on('mousedown', '#marklyra-sort-by-date-btn', function () {
          if (this.classList.contains('active')) {
            receiver.setSortType(-receiver.sortType());
          } else {
            receiver.setSortType(this.classList.contains('marklyra-sort-t') ? -2 : 2);
          }
          jquery(this).trigger('mouseenter');
          return false;
        })
        .on('mousedown', '#marklyra-sort-by-create-btn', function () {
          if (this.classList.contains('active')) {
            receiver.setSortType(-receiver.sortType());
          } else {
            receiver.setSortType(this.classList.contains('marklyra-sort-new-down') ? -3 : 3);
          }
          jquery(this).trigger('mouseenter');
          return false;
        })
        .on('keydown', function (keyboardEvent) {
          if (
            !(
              'Esc' != map[keyboardEvent.keyCode || keyboardEvent.which] ||
              keyboardEvent.metaKey ||
              keyboardEvent.ctrlKey
            )
          ) {
            this.blur();
          }
        });
      this.fileTree.bindEvents();
      this.fileList.bindEvents();
      if (File.isNodeHtml) {
        this.bindContext();
      }
    }
    async execRenameFileByNode(oldPath, newPath, backupDestination) {
      const fileSystem = reqnode('fs-extra'),
        pathUtilities = reqnode('path');
      var undoPath = newPath;
      if (backupDestination) {
        let fileName = pathUtilities.basename(newPath);
        try {
          undoPath = File.option.tempPath + sep + 'marklyra-undo' + sep + fileName;
          fileSystem.copySync(file, undoPath, { overwrite: true, preserveTimestamps: true });
        } catch (error) {
          undoPath = '';
        }
      }
      var renameError = null;
      try {
        if (await this.tryChangeEmptyFileFormat(oldPath, newPath)) {
          return [];
        }
        await (async function (oldPath, newPath) {
          try {
            await fileSystem.rename(oldPath, newPath);
          } catch (currentError) {
            if (currentError && 'EPERM' == currentError.code) {
              await fileSystem.move(oldPath, newPath, { overwrite: true });
            }
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
          if (text != separator) {
            if (
              0 != separator.indexOf(text + pathSeparator) &&
              text.substring(0, text.lastIndexOf(pathSeparator)) != separator
            ) {
              if (File.isNode) {
                (function (oldPath, openMovedFile) {
                  Object.defineProperty(showRenameFailure, 'name', {
                    value: 'c',
                    configurable: true,
                  });
                  Object.defineProperty(renameFileWithUndo, 'name', {
                    value: 'h',
                    configurable: true,
                  });
                  Object.defineProperty(confirmDestinationOverwrite, 'name', {
                    value: 'p',
                    configurable: true,
                  });

                  var fileSystem = reqnode('fs-extra'),
                    pathUtilities = reqnode('path'),
                    fileName = pathUtilities.basename(oldPath),
                    newPath = pathUtilities.join(separator, fileName);
                  function showRenameFailure(error) {
                    dialogs.showNotification(
                      '<strong>' +
                        jquery.localize.getString('Operation Failed', 'Panel') +
                        '</strong>  ' +
                        utilities.escape(error.message || ''),
                      true,
                    );
                    JSBridge.invoke('filesOp.clearUndo');
                  }
                  async function renameFileWithUndo(oldPath, newPath, backupDestination) {
                    var [renameError, undoPath] = await receiver.execRenameFileByNode(
                      oldPath,
                      newPath,
                      backupDestination,
                    );
                    !(function (inputOldPath, inputNewPath, renameError) {
                      if (renameError) {
                        if ('EXDEV' == renameError.code || 'EPERM' == renameError.code) {
                          fileSystem.copy(inputOldPath, inputNewPath, async function (copyError) {
                            if (copyError) {
                              showRenameFailure(copyError);
                            } else {
                              if (undoPath) {
                                await JSBridge.invoke('filesOp.clearUndo');
                                receiver.scheduleChangeHighlight(inputNewPath);
                              }
                            }
                          });
                        } else {
                          showRenameFailure(renameError);
                        }
                        inputNewPath = inputOldPath;
                      } else {
                        if (undoPath) {
                          JSBridge.invoke(
                            'filesOp.registerUndo',
                            undoPath,
                            inputOldPath,
                            jquery.localize
                              .getString('Move %@', 'Panel')
                              .replace('%@', reqnode('path').basename(inputOldPath)),
                          );
                        }
                      }
                      if (!renameError) {
                        if (openMovedFile) {
                          if (File.isNode) {
                            fileIntegration.statWrapper(inputNewPath, function (fileInfo) {
                              if (
                                fileInfo.isFile &&
                                fileIntegration.isSupportedFile(fileInfo.name)
                              ) {
                                receiver.openFile(inputNewPath);
                              }
                            });
                          }
                        } else {
                          receiver.scheduleChangeHighlight(inputNewPath);
                        }
                      }
                      JSBridge.invoke('app.sendEvent', 'didRename', {
                        oldPath: inputOldPath,
                        newPath: inputNewPath,
                      });
                    })(oldPath, newPath, renameError);
                  }
                  function confirmDestinationOverwrite() {
                    JSBridge.invoke('app.sendEvent', 'willRename', { oldPath: oldPath });
                    if (fileSystem.existsSync(newPath)) {
                      JSBridge.invoke('dialog.showMessageBox', {
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
                        if (0 == buttonIndex) {
                          Object.defineProperty(
                            function chooseCopyName() {
                              var endOffset = fileName.indexOf('.'),
                                baseName =
                                  -1 == endOffset ? fileName : fileName.substring(0, endOffset),
                                extension = -1 == endOffset ? '' : fileName.substring(endOffset);
                              fileName = baseName + ' (copy)' + extension;
                              newPath = pathUtilities.join(separator, fileName);
                              if (fileSystem.existsSync(newPath)) {
                                chooseCopyName();
                              } else {
                                receiver.execRenameFileByNode(oldPath, newPath).then(function ([
                                  renameError,
                                ]) {
                                  if (renameError) {
                                    showRenameFailure(renameError);
                                    newPath = oldPath;
                                  } else {
                                    JSBridge.invoke(
                                      'filesOp.registerUndo',
                                      newPath,
                                      oldPath,
                                      jquery.localize
                                        .getString('Move %@', 'Panel')
                                        .replace('%@', reqnode('path').basename(oldPath)),
                                    );
                                    if (openMovedFile) {
                                      receiver.openFile(newPath);
                                    } else {
                                      receiver.scheduleChangeHighlight(newPath);
                                    }
                                  }
                                  JSBridge.invoke('app.sendEvent', 'didRename', {
                                    oldPath: oldPath,
                                    newPath: newPath,
                                  });
                                });
                              }
                            },
                            'name',
                            { value: 's', configurable: true },
                          )();
                        } else {
                          if (1 == buttonIndex) {
                            renameFileWithUndo(oldPath, newPath, true);
                          } else {
                            newPath = oldPath;
                            JSBridge.invoke('app.sendEvent', 'didRename', {
                              oldPath: oldPath,
                              newPath: newPath,
                            });
                          }
                        }
                      });
                    } else {
                      renameFileWithUndo(oldPath, newPath);
                    }
                  }
                  var warningSetting = receiver.useTreeStyle
                    ? 'noWarnigForMoveFile'
                    : 'noWarnigForMoveFileToList';
                  if (File.option[warningSetting]) {
                    confirmDestinationOverwrite();
                  } else {
                    dialogs
                      .showWarningDialog(
                        jquery.localize
                          .getString('Are you sure you want to move %@?', 'Panel')
                          .replace('%@', fileName),
                        true,
                      )
                      .then(({ response: buttonIndex, checkboxChecked: dontAskAgain }) => {
                        if (0 == buttonIndex) {
                          confirmDestinationOverwrite();
                          if (dontAskAgain) {
                            JSBridge.execForAll(
                              'window.File && File.option && (File.option.%@ = true)'.replace(
                                '%@',
                                warningSetting,
                              ),
                            );
                            JSBridge.putSetting(warningSetting, true);
                          }
                        }
                      });
                  }
                })(text, openMovedFile);
              } else {
                if (File.isMac) {
                  (function (source, openMovedFile) {
                    var fileName = fileIntegration.getFileNameFromPath(source);
                    openMovedFile = openMovedFile && fileIntegration.isSupportedFile(fileName);
                    var dest = separator + '/' + fileName;
                    bridge.callHandler('library.moveFile', {
                      source: source,
                      dest: dest,
                      shouldOpen: openMovedFile || false,
                    });
                  })(text, openMovedFile);
                }
              }
            } else {
              receiver.getDelegate().highlight(text);
            }
          }
        });
      }
    }
    sortType() {
      return valueOrDefault(
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
      Object.defineProperty(compareFileNames, 'name', { value: 'n', configurable: true });

      if (!firstItem || !secondItem) {
        return 1;
      }
      function compareFileNames(searchValue, normalizedText) {
        if (searchValue == normalizedText) {
          return 0;
        }
        searchValue = searchValue.toLowerCase();
        normalizedText = normalizedText.toLowerCase();
        var currentSearchValue = searchValue.replace(/\..+/, ''),
          secondBaseName = normalizedText.replace(/\..+/g, '');
        if (File.isWin) {
          if (currentSearchValue == secondBaseName) {
            if (0 == [searchValue, normalizedText].sort().indexOf(searchValue)) {
              return -1;
            } else {
              return 1;
            }
          } else {
            if (0 == [currentSearchValue, secondBaseName].sort().indexOf(currentSearchValue)) {
              return -1;
            } else {
              return 1;
            }
          }
        } else {
          if (currentSearchValue == secondBaseName) {
            return searchValue.localeCompare(normalizedText);
          } else {
            return currentSearchValue.localeCompare(secondBaseName);
          }
        }
      }
      var sortType = this.sortType();
      if (sortType == SortType.Alphabet) {
        return compareFileNames(firstItem.name, secondItem.name);
      } else {
        if (sortType == SortType.Date) {
          return firstItem.lastModified - secondItem.lastModified;
        } else {
          if (sortType == SortType.AlphabetDescend) {
            return compareFileNames(secondItem.name, firstItem.name);
          } else {
            if (sortType == SortType.DateDescend) {
              return secondItem.lastModified - firstItem.lastModified;
            } else {
              if (sortType == SortType.CreateDate) {
                return firstItem.createDate - secondItem.createDate;
              } else {
                if (sortType == SortType.CreateDateDescend) {
                  return secondItem.createDate - firstItem.createDate;
                } else {
                  if (sortType == SortType.NaturalDescend) {
                    return -utilities.naturalCompare(firstItem.name, secondItem.name);
                  } else {
                    return utilities.naturalCompare(firstItem.name, secondItem.name);
                  }
                }
              }
            }
          }
        }
      }
    }
    setSortType(sortType) {
      jquery('.marklyra-side-sort-btn2').removeClass('active');
      if (sortType == SortType.Alphabet) {
        jquery('#marklyra-sort-by-name-btn')
          .removeClass('marklyra-sort-a')
          .addClass('active')
          .attr('marklyra-hint', jquery.localize.getString('Sort by Name (Ascending)'));
      } else {
        if (sortType == SortType.Date) {
          jquery('#marklyra-sort-by-date-btn')
            .removeClass('marklyra-sort-t')
            .addClass('active')
            .attr(
              'marklyra-hint',
              jquery.localize.getString('Sort by Modification Date (Ascending)'),
            );
        } else {
          if (sortType == SortType.AlphabetDescend) {
            jquery('#marklyra-sort-by-name-btn')
              .addClass('marklyra-sort-a')
              .addClass('active')
              .attr('marklyra-hint', jquery.localize.getString('Sort by Name (Descending)'));
          } else {
            if (sortType == SortType.DateDescend) {
              jquery('#marklyra-sort-by-date-btn')
                .addClass('marklyra-sort-t')
                .addClass('active')
                .attr(
                  'marklyra-hint',
                  jquery.localize.getString('Sort by Modification Date (Descending)'),
                );
            } else {
              if (sortType == SortType.CreateDate) {
                jquery('#marklyra-sort-by-create-btn')
                  .removeClass('marklyra-sort-new-down')
                  .addClass('active')
                  .attr(
                    'marklyra-hint',
                    jquery.localize.getString('Sort by Creation Date (Ascending)'),
                  );
              } else {
                if (sortType == SortType.CreateDateDescend) {
                  jquery('#marklyra-sort-by-create-btn')
                    .addClass('marklyra-sort-new-down')
                    .addClass('active')
                    .attr(
                      'marklyra-hint',
                      jquery.localize.getString('Sort by Creation Date (Descending)'),
                    );
                } else {
                  if (sortType == SortType.NaturalDescend) {
                    jquery('#marklyra-sort-by-natural-btn')
                      .addClass('marklyra-sort-by-natural-d')
                      .addClass('active')
                      .attr(
                        'marklyra-hint',
                        jquery.localize.getString('Sort Naturally (Descending)'),
                      );
                  } else {
                    jquery('#marklyra-sort-by-natural-btn')
                      .removeClass('marklyra-sort-by-natural-d')
                      .addClass('active')
                      .attr(
                        'marklyra-hint',
                        jquery.localize.getString('Sort Naturally (Ascending)'),
                      );
                  }
                }
              }
            }
          }
        }
      }
      if (this.getDelegate().sortType != sortType) {
        this.getDelegate().setSortType(sortType);
      }
    }
    selectFolder() {
      if (File.isMac) {
        bridge.callHandler('controller.selectFolder');
      } else {
        var receiver = this;
        JSBridge.invoke('dialog.showOpenDialog', {
          buttonLabel: jquery.localize.getString('Select'),
          properties: ['openDirectory'],
        }).then(({ filePaths: folderPaths }) => {
          var folderPath = (folderPaths || [])[0];
          if (folderPath) {
            receiver.onRootChanged(folderPath);
          }
        });
      }
    }
    showSidebarMenu() {
      Object.defineProperty(createFolderMenuItem, 'name', { value: 'i', configurable: true });

      jquery('.sidebar-footer').addClass('show-sidebar-footer-context');
      var updatePinnedFolderOrder,
        sidebarMenu = jquery('#sidebar-files-menu').focus(),
        folderTemplate = jquery('#folder-menu-item-template').html();
      function createFolderMenuItem(folderEntry, insertBefore) {
        var element = jquery(folderTemplate);
        element.find('span').text(folderEntry.name);
        element.attr('data-path', folderEntry.path);
        element.attr('data-pinned', folderEntry.pinned);
        element.attr('marklyra-hint', utilities.abbreviatingWithTilde(folderEntry.path));
        if (folderEntry.pinned) {
          element.find('.sidebar-folder-pin').attr('marklyra-hint', 'Unpin');
        }
        insertBefore.before(element);
        return element;
      }
      updatePinnedFolderOrder = Object.defineProperty(
        function (slice) {
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
            if (inputItem.path === File.getMountFolder()) {
              item = inputItem;
            } else {
              if (inputItem.pinned) {
                currentItems.push(inputItem);
              } else {
                localItems.push(inputItem);
              }
            }
          });
          if (File.getMountFolder() && !item) {
            item = {
              path: File.getMountFolder(),
              name: fileIntegration.getFileNameFromPath(File.getMountFolder()),
              pinned: false,
            };
          }
          slice = (slice = currentItems.concat(localItems)).slice(0, maxVisibleFolders);
          for (
            var menuAnchor = jquery('#folder-menu-item-after'), itemIndex = 0;
            itemIndex < slice.length;
            itemIndex++
          ) {
            createFolderMenuItem(slice[itemIndex], menuAnchor);
          }
          if (item) {
            createFolderMenuItem(item, menuAnchor).addClass('selected-folder-menu-item');
          } else {
            if (0 == slice.length) {
              sidebarMenu.find('.folder-menu-group').removeClass('show');
            }
          }
        },
        'name',
        { value: 'e', configurable: true },
      );
      if (File.isMac) {
        bridge.callHandler('library.getRecentFolders', updatePinnedFolderOrder);
      } else {
        if (File.isNode) {
          JSBridge.invoke('setting.getRecentFiles').then((result) => {
            updatePinnedFolderOrder(result.folders);
          });
        } else {
          updatePinnedFolderOrder([]);
        }
      }
    }
    init() {
      this.bindEvents();
      var receiver = this;
      if (File.option.sidebarTab) {
        this.show();
      }
      if (File.isMac && !fileIntegration.getCurrentFilePath()) {
        bridge.callHandler('controller.shouldLoadFolder', function (opened) {
          if (opened) {
            if (!receiver.isFileTabShown()) {
              receiver.show(receiver.useTreeStyle ? 'file-tree' : 'file-list');
            }
          }
        });
      }
    }
    switch(tabName, unusedParameter2) {
      jquery('.sidebar-content').scrollTop(0);
      if ('outline' == tabName) {
        var switchLabel;
        this.fileSearch.hide();
        jquery('#marklyra-sidebar').addClass('active-tab-outline').removeClass('active-tab-files');
        jquery('[data-side-mode]').removeClass('selected-folder-menu-item');
        jquery("[data-side-mode='outline']").addClass('selected-folder-menu-item');
        jquery('#sidebar-footer-main-item-label').text(jquery.localize.getString('Outline'));
        this.outline.highlightVisibleHeader();
        if (this.useTreeStyle) {
          switchLabel = jquery.localize.getString('Switch to File Tree view');
          jquery('#switch-sidebar-icon')
            .html('<span class="marklyra-icon marklyra-file-tree"></span>')
            .attr('marklyra-hint', switchLabel)
            .attr('aria-label', switchLabel);
        } else {
          switchLabel = jquery.localize.getString('Switch to File List view');
          jquery('#switch-sidebar-icon')
            .html('<span class="marklyra-icon marklyra-three-cells"></span>')
            .attr('marklyra-hint', switchLabel)
            .attr('aria-label', switchLabel);
        }
      } else {
        this.outline.hideSearch();
        jquery('#marklyra-sidebar').removeClass('active-tab-outline').addClass('active-tab-files');
        var useTreeStyle = this.useTreeStyle || false;
        if ('file-list' == tabName) {
          useTreeStyle = false;
        } else {
          if ('file-tree' == tabName) {
            useTreeStyle = true;
          } else {
            tabName = useTreeStyle ? 'file-tree' : 'file-list';
          }
        }
        this.switchTreeOrList(useTreeStyle);
        this.refreshMenuVisibility();
        jquery('#switch-sidebar-icon')
          .html('<span class="marklyra-icon marklyra-list"></span>')
          .attr('marklyra-hint', jquery.localize.getString('Switch to Outline view'));
      }
      jquery('#switch-sidebar-icon').localize('Front', {
        language: File.language,
        pathPrefix: 'locales',
      });
      JSBridge.putSetting('sidebar_tab', tabName);
      if (File.isNode) {
        window.ClientCommand.refreshViewMenu();
      } else {
        this.updateMenu(tabName);
        jquery('.sidebar-tab')
          .removeClass('active')
          .filter(
            'outline' == tabName
              ? '#sidepanel-segmented-input-outline'
              : '#sidepanel-segmented-input-files',
          )
          .addClass('active');
      }
    }
    shouldIgnore(filePath) {
      var relativePath = '/' + (filePath || '').substring((File.getMountFolder() || '').length);
      return !!/[\\\/](\.\w|node_modules[\\\/])/.exec(relativePath);
    }
    calcMountFolder(stopAtParent) {
      var receiver = this;
      return new Promise(function (resolvePromise, rejectPromise) {
        Object.defineProperty(finishRootChange, 'name', { value: 'r', configurable: true });

        function finishRootChange(mountFolder_) {
          File.mountFolder_ = mountFolder_;
          resolvePromise(mountFolder_);
          if (receiver.isFileTabShown()) {
            receiver.refreshMenuVisibility();
          }
        }
        if (File.isMac) {
          bridge.callHandler('controller.calcMountFolder', finishRootChange);
        } else {
          if (File.mountFolder_) {
            finishRootChange(File.getMountFolder());
          } else {
            if (File.isNode) {
              finishRootChange(
                (function (folderPath) {
                  var pathUtilities = reqnode('path'),
                    fileSystem = reqnode('fs'),
                    currentSeparator = folderPath;
                  if (!folderPath) {
                    return null;
                  }
                  for (; currentSeparator && /^\w*\/+\w/.exec(currentSeparator); ) {
                    var folderEntries = fileSystem.readdirSync(currentSeparator);
                    if (
                      folderEntries.indexOf('.git') > -1 ||
                      folderEntries.indexOf('.svn') > -1 ||
                      folderEntries.indexOf('.hg') > -1 ||
                      folderEntries.indexOf('package.json') > -1
                    ) {
                      return currentSeparator;
                    }
                    if (
                      /((dropbox\/apps\/[^\/]+)|pages|articles?|blogs?|content)\/?$/i.exec(
                        currentSeparator,
                      )
                    ) {
                      return currentSeparator;
                    }
                    if (/(_?posts?|_?drafts?)\/?$/i.exec(currentSeparator)) {
                      return currentSeparator;
                    }
                    if (/(node_modules)\/[^\/]+\/?$/i.exec(currentSeparator)) {
                      return currentSeparator;
                    }
                    var separator = currentSeparator;
                    if (
                      (currentSeparator = pathUtilities.join(currentSeparator, '../')) ==
                        separator ||
                      stopAtParent
                    ) {
                      break;
                    }
                  }
                  return folderPath || null;
                })(fileIntegration.getCurrentFileFolderPath()),
              );
            }
          }
        }
      });
    }
    renderIfNeed() {
      if (this.useTreeStyle) {
        return this.fileTree.renderIfNeed();
      } else {
        return this.fileList.renderIfNeed();
      }
    }
    findElemFromPath(filePath) {
      return jquery(".file-library-node[data-path='" + utilities.escapeSelector(filePath) + "']");
    }
    revealInSidebar() {
      this.fileSearch.hide();
      if (this.isFileTabShown()) {
        this.markCurrentFile();
      } else {
        if (fileIntegration.getCurrentFilePath()) {
          this.showSidebar('files');
        }
      }
    }
    revealInFileList() {
      this.showSidebar('file-list');
      this.markCurrentFile();
    }
    revealInFileTree() {
      this.showSidebar('file-tree');
      this.markCurrentFile();
    }
    markCurrentFile(immediate, skipFocus) {
      var filePath = fileIntegration.getCurrentFilePath();
      if (filePath) {
        this.markOpenedFile(filePath);
        if (!skipFocus) {
          this.getDelegate().focusToFile(filePath, immediate);
        }
        this.fileSearch.markOpenedFile(filePath);
      }
    }
    markOpenedFile(filePath) {
      if (!filePath) {
        return jquery();
      }
      var element = this.findElemFromPath(filePath);
      jquery('.file-library-node.active').removeClass('active');
      if (element.length) {
        element.addClass('active');
      }
      return element;
    }
    end() {
      this.fileTree.needRepaint();
      this.fileList.needRepaint(true);
      this.root = null;
      File.mountFolder_ = null;
      if (this.fsWatcher) {
        this.fsWatcher.close();
        this.fsWatcher = null;
        this.watchedFolder = null;
        if (localTimerId) {
          clearTimeout(localTimerId);
        }
      } else {
        for (var watchedPath in this.unixWatchers) {
          if (this.unixWatchers[watchedPath]) {
            this.unixWatchers[watchedPath].close();
          }
        }
        this.unixWatchers = {};
      }
    }
    refreshMenuVisibility() {
      var footerElement = jquery('#marklyra-sidebar-footer');
      if (File.getMountFolder()) {
        footerElement.find('.empty-menu-group').removeClass('show');
        footerElement.find('.not-empty-menu-group').addClass('show');
        jquery('#marklyra-sidebar').removeClass('marklyra-no-mount-folder');
        if (this.isReadOnlyRoot()) {
          document.querySelector('#sidebar-new-file-btn').classList.add('hide');
        } else {
          document.querySelector('#sidebar-new-file-btn').classList.remove('hide');
        }
      } else {
        footerElement.find('.empty-menu-group').addClass('show');
        footerElement.find('.not-empty-menu-group').removeClass('show');
        jquery('#marklyra-sidebar').addClass('marklyra-no-mount-folder');
      }
      jquery('#sidebar-footer-main-item-label').text(
        fileIntegration.getFileNameFromPath(File.getMountFolder()) ||
          jquery.localize.getString('Open Folder...'),
      );
    }
    isReadOnlyRoot() {
      const text = File.getMountFolder();
      if (text) {
        if (File.isMac) {
          return text.toLowerCase().indexOf('marklyra.app') > -1;
        } else {
          return (
            !window.debugMode &&
            (window.dirname
              ? text.toLowerCase().indexOf(window.dirname.toLowerCase()) > -1
              : void 0)
          );
        }
      }
    }
    onRootChanged(folderPath, skipRecentFolder) {
      this.end();
      if (folderPath) {
        File.setMountFolder(folderPath);
        if (File.isNode && !skipRecentFolder) {
          JSBridge.invoke('setting.addRecentFolder', folderPath);
        }
      }
      if (jquery('#file-library:visible').length) {
        this.renderIfNeed();
      }
      if (this.editor.quickOpenPanel) {
        this.editor.quickOpenPanel.cacheFolder(folderPath);
      } else {
        var editor = this.editor;
        setTimeout(function () {
          if (editor.quickOpenPanel) {
            editor.quickOpenPanel.cacheFolder(folderPath);
          }
        }, 1e3);
      }
      this.refreshMenuVisibility();
    }
    setMountFolder(folderPath, showSidebar, silent) {
      console.debug('open folder ' + folderPath);
      this.silent = silent;
      this.onRootChanged(folderPath);
      if (showSidebar) {
        this.showSidebar(this.useTreeStyle ? 'file-tree' : 'file-library', true);
      }
    }
    onFileUpdated(fileInfo) {
      var path = (fileInfo || {}).path;
      try {
        if (path == File.bundle.filePath) {
          File.bundle.modifiedDate = fileInfo.lastModifiedDate;
        }
        this.fileList.onFileUpdated(path, fileInfo);
        this.fileTree.onFileUpdated(path);
      } catch (error) {
        console.warn(error);
      }
      try {
        this.pauseOnChange(true, path);
      } catch (currentError) {}
    }
    onFileChanges(inputItems) {
      if (File.getMountFolder()) {
        console.debug(inputItems);
        console.debug('suppress on change -> ' + suppressChanges);
        this.fileTree.onChangeForMac(inputItems);
        this.fileList.onChangeForMac(inputItems);
        var currentFileRenamed = false,
          oldPath = fileIntegration.getCurrentFilePath();
        inputItems.map(function (item) {
          if (item.oldPath == oldPath && 'rename' == item.type) {
            currentFileRenamed = true;
          }
        });
        if (currentFileRenamed) {
          var receiver = this;
          setTimeout(function () {
            receiver.markCurrentFile();
          }, 1e3);
        }
      }
    }
    getDelegate() {
      if (this.useTreeStyle) {
        return this.fileTree;
      } else {
        return this.fileList;
      }
    }
    isDiscardableUntitled() {
      return !(File.isDocumentEdited() || File.bundle.filePath);
    }
    newFile(folderPath) {
      if (File.getMountFolder()) {
        this.getDelegate().newFile(folderPath);
      }
    }
    openFileCommand(targetElement) {
      if (!targetElement) {
        retrun;
      }
      var filePath = this.editor
        .getJQueryElem(targetElement)
        .closest('.file-library-node, .marklyra-search-item')
        .attr('data-path');
      this.openFile(filePath);
      this.outline.autoHideOutline();
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
      this.editor.UserOp.setClipboard('<span>' + filePath + '</span>', null, filePath, true);
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
      Object.defineProperty(switchAfterFileDeletion, 'name', { value: 's', configurable: true });
      Object.defineProperty(trashSelectedFile, 'name', { value: 'l', configurable: true });

      var element = targetElement
          ? this.editor.getJQueryElem(targetElement).closest('.file-library-node')
          : this.findElemFromPath(toDel),
        isCurrentFile =
          (toDel = toDel || element.attr('data-path')) == fileIntegration.getCurrentFilePath();
      if (toDel) {
        var receiver = this;
        if (File.isMac) {
          bridge.callHandler('library.trashItem', toDel, function (deleted) {
            if (deleted) {
              switchAfterFileDeletion();
              element.hide();
            }
            if (onDeleted) {
              onDeleted(deleted);
            }
          });
        } else {
          if (File.isNode) {
            if (File.option.noWarnigForDeleteFile) {
              trashSelectedFile();
            } else {
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
                if (0 == buttonIndex) {
                  if (dontAskAgain) {
                    JSBridge.execForAll(
                      'window.File && File.option && (File.option.noWarnigForDeleteFile = true)',
                    );
                    JSBridge.putSetting('noWarnigForDeleteFile', true);
                  }
                  trashSelectedFile();
                } else {
                  if (onDeleted) {
                    onDeleted(false);
                  }
                }
              });
            }
          }
        }
      } else {
        if (onDeleted) {
          onDeleted(false);
        }
      }
      function switchAfterFileDeletion() {
        if (isCurrentFile) {
          var nextFileElement = receiver.useTreeStyle
            ? jquery()
            : element.filter('.file-list-item').next();
          if (!onDeleted && nextFileElement.length) {
            receiver.openFileCommand(nextFileElement[0]);
          } else {
            if (File.isNode) {
              switchToFile(null, () => {
                if (onDeleted) {
                  onDeleted(true);
                }
              });
            } else {
              if (onDeleted) {
                onDeleted(true);
              }
            }
          }
        }
      }
      async function trashSelectedFile() {
        if (await JSBridge.invoke('shell.trashItem', toDel)) {
          switchAfterFileDeletion();
          element.hide();
          JSBridge.invoke('filesOp.clearUndo');
          JSBridge.invoke('app.sendEvent', 'updateQuickOpenCache', { toDel: toDel });
        } else {
          var backupPath = File.option.tempPath + '/' + new Date().getTime(),
            fileSystem = reqnode('fs-extra'),
            backupCreated = false;
          try {
            await fileSystem.copyFile(toDel, backupPath);
            backupCreated = true;
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
            if (0 == buttonIndex) {
              JSBridge.invoke('shell.openItem', toDel);
              if (onDeleted) {
                onDeleted(false);
              }
            } else {
              if (1 == buttonIndex) {
                fileSystem.unlink(toDel, function (deleteError) {
                  if (deleteError) {
                    JSBridge.invoke('dialog.showMessageBox', {
                      type: 'info',
                      title: jquery.localize.getString('Error', 'Panel'),
                      message: jquery.localize.getString('Operation Failed', 'Panel'),
                      detail:
                        deleteError.stack || deleteError.message || (deleteError || '').toString(),
                      defaultId: 0,
                      cancelId: 1,
                      buttons: [
                        jquery.localize.getString('Reveal in File Explorer'),
                        jquery.localize.getString('Cancel'),
                      ],
                    }).then(({ response: buttonIndex }) => {
                      if (0 == buttonIndex) {
                        JSBridge.invoke('shell.openItem', toDel);
                      }
                      if (onDeleted) {
                        onDeleted(false);
                      }
                    });
                  } else {
                    if (backupCreated) {
                      JSBridge.invoke(
                        'filesOp.registerUndo',
                        backupPath,
                        toDel,
                        jquery.localize
                          .getString('Delete %@', 'Menu')
                          .replace('%@', reqnode('path').basename(toDel)),
                      );
                    } else {
                      JSBridge.invoke('filesOp.clearUndo');
                    }
                    switchAfterFileDeletion();
                  }
                });
              } else {
                if (onDeleted) {
                  onDeleted(false);
                }
              }
            }
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
      if (filePath) {
        if (File.isWin) {
          fileIntegration.winShell().openProperties(File.bundle.filePath);
        } else {
          if (File.isMac) {
            bridge.callHandler('library.showProperty', filePath);
          }
        }
      }
    }
    duplicateFileCommand(targetElement) {
      Object.defineProperty(canDuplicateCurrentDocument, 'name', {
        value: 'p',
        configurable: true,
      });
      Object.defineProperty(revealDuplicatedFile, 'name', { value: 'f', configurable: true });

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
      async function canDuplicateCurrentDocument(filePath) {
        return (
          !!receiver.isDiscardableUntitled() ||
          (filePath === File.bundle.filePath &&
            (!(!File.option.enableAutoSave && !File.option.saveFileOnSwitch) ||
              !(!File.isMac || !(await JSBridge.invoke('controller.canSwitchWithoutAsk'))) ||
              !(File.isMac || (File.bundle.hasModified && File.changeCounter.isDocumentEdited())) ||
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
      function revealDuplicatedFile(path) {
        var sourceElement = receiver.findElemFromPath(sourcePath),
          folderPath = File.isMac ? path.replace(/\/[^\/]+$/, '') : reqnode('path').dirname(path),
          newFileElement = receiver.getDelegate().onAddFile({
            isDirectory: false,
            isFile: true,
            name: fileIntegration.getFileNameFromPath(path),
            path: path,
            folderPath: folderPath,
            folderName: fileIntegration.getFileNameFromPath(folderPath),
            lastModified: new Date(),
            summary: sourceElement.find('.file-list-item-summary').text(),
            fetched: true,
          });
        if (newFileElement) {
          receiver.getDelegate().focusToFile(path, false, true);
          receiver.renameFileCommand(newFileElement, true);
        }
      }
      if (File.isNode) {
        pathUtilities = reqnode('path');
        fileName = pathUtilities.basename(sourcePath);
        startOffset = fileName.lastIndexOf('.');
        directoryPath = pathUtilities.dirname(sourcePath);
        fileSystem = reqnode('fs');
        currentSep = pathUtilities.sep;
        if (startOffset < 0) {
          startOffset = newFileName.length;
        }
        textSlice = fileName.substr(startOffset);
        fileName = fileName.substr(0, startOffset);
        JSBridge.invoke('filesOp.clearUndo');
        Object.defineProperty(
          function copyWithAvailableName(sourcePath, baseName, extension, folderPath) {
            baseName = '%@ (copy)'.replace('%@', baseName);
            var destinationPath = folderPath + currentSep + baseName + extension;
            fileSystem.copyFile(
              sourcePath,
              destinationPath,
              fileSystem.constants.COPYFILE_EXCL,
              function (copyError) {
                if (copyError) {
                  if ('EEXIST' == copyError.code) {
                    copyWithAvailableName(sourcePath, baseName, extension, folderPath);
                  } else {
                    if (copyError) {
                      dialogs.showNotification(
                        '<strong>' +
                          jquery.localize.getString('Operation Failed', 'Panel') +
                          '</strong>  ' +
                          utilities.escape(copyError.message || ''),
                        true,
                      );
                    }
                  }
                } else {
                  receiver.scheduleChangeHighlight(destinationPath);
                  if (File.isWin) {
                    revealDuplicatedFile(destinationPath);
                  }
                  canDuplicateCurrentDocument(sourcePath).then(function (result) {
                    if (result) {
                      receiver.openFile(destinationPath);
                    }
                  });
                }
              },
            );
          },
          'name',
          { value: 'e', configurable: true },
        )(sourcePath, fileName, textSlice, directoryPath);
      } else {
        (function (sourcePath) {
          bridge.callHandler('library.duplicate', sourcePath, function (destinationPath) {
            if (destinationPath) {
              canDuplicateCurrentDocument(sourcePath).then(function (result) {
                if (result) {
                  receiver.openFile(destinationPath);
                }
              });
              receiver.scheduleChangeHighlight(destinationPath);
              revealDuplicatedFile(destinationPath);
            }
          });
        })(sourcePath);
      }
    }
    scheduleChangeHighlight(nextChangeHighlight) {
      this.nextChangeHighlight = nextChangeHighlight;
      var receiver = this;
      receiver.getDelegate().highlight(nextChangeHighlight);
      if (this.nextChangeHighlightTimer) {
        clearTimeout(this.nextChangeHighlightTimer);
      }
      this.nextChangeHighlightTimer = setTimeout(function () {
        receiver.nextChangeHighlight = null;
        receiver.nextChangeHighlightTimer = null;
      }, 2e3);
    }
    refreshPanelCommand() {
      var mountFolder = File.getMountFolder();
      if (mountFolder) {
        this.end();
        if (File.isNode) {
          File.setMountFolder(mountFolder);
          this.renderIfNeed();
          this.refreshMenuVisibility();
        } else {
          bridge.callHandler('controller.switchFolder', mountFolder, function () {
            bridge.callHandler('controller.bindFolderMonitor');
          });
        }
      }
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
        (await fileSystem.rm(oldPath, { force: true, recursive: true }),
        File.FileSave.saveAsUseNode(newPath),
        JSBridge.invoke('filesOp.clearUndo'),
        0)
      );
    }
    async cannotRename(oldPath, newPath, unusedParameter3) {
      Object.defineProperty(getFileTypeLabel, 'name', { value: 'o', configurable: true });

      if (!File.option.supportTextBundle) {
        return false;
      }
      let normalizedText = fileIntegration.getExtension(oldPath).toLowerCase(),
        currentNormalizedText = fileIntegration.getExtension(newPath).toLowerCase();
      function getFileTypeLabel(extension) {
        if ('textbundle' === extension) {
          return 'TextBundle file';
        } else {
          if ('textpack' === extension) {
            return 'TextPack file';
          } else {
            return 'Markdown file';
          }
        }
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
            text
              .replace('$1', getFileTypeLabel(normalizedText))
              .replace('$2', getFileTypeLabel(currentNormalizedText)),
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
      Object.defineProperty(sanitizeFileName, 'name', { value: 'p', configurable: true });
      Object.defineProperty(applyInlineRename, 'name', { value: 'm', configurable: true });
      Object.defineProperty(selectRenameBaseName, 'name', { value: 'g', configurable: true });

      var blurHandled,
        renameHandled,
        originalName = inputElement.val(),
        receiver = this;
      function sanitizeFileName(text) {
        return (
          File.isWin
            ? text.replace(/[\\\/:*?"<>\|\000-\031]/g, '')
            : text.replace(/[\/\\\000-\031]/g, '')
        ).trim();
      }
      async function applyInlineRename() {
        if (!renameHandled) {
          renameHandled = true;
          var newName = sanitizeFileName(inputElement.val()),
            pathSeparator = File.isWin ? '\\' : '/',
            oldPath = parentPath + pathSeparator + originalName,
            newPath = parentPath + pathSeparator + newName;
          if (newName.length > 0 && newName != originalName) {
            if (
              !skipFormatValidation &&
              !newlyCreated &&
              (await receiver.cannotRename(oldPath, newPath, renameCompatibilityFlag))
            ) {
              return void onCancel();
            }
            inputElement.val(newName);
            onRename(inputElement);
          } else {
            onCancel();
          }
        }
      }
      function selectRenameBaseName(selectWholeName) {
        var fileName = inputElement.val(),
          endOffset = fileName.lastIndexOf('.');
        if (endOffset < 0 && selectWholeName) {
          endOffset = fileName.length;
        }
        if (endOffset > 0) {
          inputElement[0].setSelectionRange(0, endOffset);
        }
      }
      renameOnBlur = !!newlyCreated;
      inputElement
        .off('blur')
        .on('blur', function () {
          if (!blurHandled) {
            if (receiver.stopRename) {
              return false;
            }
            blurHandled = true;
            if (renameOnBlur) {
              applyInlineRename();
            } else {
              (function (inputElement) {
                inputElement.val(sanitizeFileName(inputElement.val()));
                if (originalName != inputElement.val()) {
                  dialogs.confirm(
                    jquery.localize.getString('Rename to "{0}" ?').format(inputElement.val()),
                    function (unusedParameter1) {
                      receiver.markFocusOnDialogClose();
                      applyInlineRename();
                    },
                    function () {
                      onCancel();
                    },
                  );
                } else {
                  onCancel();
                }
              })(inputElement);
            }
          }
        })
        .off('keydown')
        .on('keydown', function (keyboardEvent) {
          if ('Enter' == map[keyboardEvent.keyCode || keyboardEvent.which]) {
            blurHandled = true;
            applyInlineRename();
            return false;
          } else {
            if ('Esc' == map[keyboardEvent.keyCode || keyboardEvent.which]) {
              blurHandled = true;
              onCancel();
              return false;
            } else {
              if (
                'A' == map[keyboardEvent.keyCode || keyboardEvent.which] &&
                (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey)
              ) {
                selectRenameBaseName(true);
                return false;
              } else {
                return void 0;
              }
            }
          }
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
          if (this.selectionEnd == this.value.length) {
            selectRenameBaseName();
            return false;
          }
        })
        .on('focus', selectRenameBaseName);
    }
  };
}
