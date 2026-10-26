// document/options.
export default function initializeDocumentOptions(requireModule, moduleExports, moduleRecord) {
  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    utilities = requireModule('shared/utilities'),
    undoManager = requireModule('editing/undo-manager'),
    dialogs = (requireModule('host/environment'), requireModule('ui/dialogs')),
    fileIntegration = requireModule('host/file-integration'),
    documentMenu = requireModule('ui/document-menu'),
    localDiagnostics = requireModule('host/local-diagnostics'),
    recovery = requireModule('document/recovery'),
    Reporter = localDiagnostics.Reporter;
  const throttledZoom = (function (zoomCallback, delay) {
    let cooldownTimer = null;
    return (...callbackArguments) => {
      if (null === cooldownTimer) {
        zoomCallback(...callbackArguments);
        cooldownTimer = setTimeout(() => {
          cooldownTimer = null;
        }, delay);
      }
    };
  })(function (zoomDirection) {
    if (zoomDirection < 0) {
      JSBridge.zoom.zoomIn();
    } else {
      JSBridge.zoom.zoomOut();
    }
  }, 500);
  var fileOptions = {
    DEFAULT_OPTIONS: {
      keys: {},
      indentByTab: false,
      indentSize: 2,
      codeIndentSize: 4,
      enableInlineMath: true,
      autoNumberingForMath: false,
      enableHighlight: false,
      enableSubscript: false,
      enableSuperscript: false,
      enableDiagram: false,
      enableAlert: true,
      copyMarkdownByDefault: false,
      showLineNumbersForFence: false,
      useRelativePathForImg: false,
      autoCorrectMisspell: false,
      noPairingMatch: false,
      autoPairExtendSymbol: false,
      enableAutoSave: false,
      scrollWithCursor: false,
      expandSimpleBlock: false,
      allowImageMove: true,
      allowImageUpload: true,
      headingStyle: 0,
      ulStyle: 0,
      olStyle: 0,
      strictMarkdown: false,
      preferCRLF: false,
      sortType: 0,
      sidebarTab: '',
      useTreeStyle: false,
      noLineWrapping: false,
      prettyIndent: false,
      defaultImageStorage: null,
      applyImageMoveForWeb: false,
      applyImageMoveForLocal: true,
      ignoreLineBreak: false,
      preLinebreakOnExport: false,
      hideBrAndLineBreak: false,
      indentFirstLine: false,
      monocolorEmoji: false,
      useFsQueue: true,
      isLocked: false,
      convertSmartOnRender: false,
      remapUnicodePunctuation: false,
      smartDash: false,
      smartQuote: false,
      userQuotesArray: null,
      autoResizeIframe: true,
      blockHTML: true,
      sendAnonymousUsage: true,
      presetSpellCheck: 'auto',
      sidebarWidth: null,
      caseSensitive: false,
      wholeWord: false,
      fileSearchCaseSensitive: false,
      fileSearchWholeWord: false,
      wordCountDelimiter: 0,
      listNoGroup: false,
      treeNoGroup: false,
      wordsPerMinute: 382,
      autoEscapeImageURL: false,
      mathFormatOnCopy: 'svg',
      gitlabMath: true,
      spellcheckForCodeAndLink: false,
      preferFinalNewline: false,
      htmlMath: false,
      strictNumberStartOnNewLine: false,
      noDisplayLinesInMath: false,
      lineWiseCopyCut: false,
      noAutoLink: false,
      defaultExtension: 'md',
      defaultCodeLang: '',
      defaultCodeLangOption: 1,
      DefaultCodeLangOptionCode: 1,
      DefaultCodeLangOptionMenu: 2,
      noLegacyMath: false,
      noEmojiAutoComplete: false,
      zoomByMouse: false,
    },
    readOption: function () {
      if (window._options) {
        File.option = jquery.extend(File.option, window._options);
      }
      if (window._documentState) {
        File.setDocumentState(_documentState);
      }
      var autoNumberingForMath = (window._options || {}).autoNumberingForMath;
      File.option.autoNumberingForMath = !!autoNumberingForMath && 'all';
      if ('ams' == autoNumberingForMath) {
        File.option.autoNumberingForMath = 'ams';
      }
      if (
        !(
          '0' != autoNumberingForMath &&
          'none' != autoNumberingForMath &&
          'null' != autoNumberingForMath &&
          'false' != autoNumberingForMath &&
          'nil' != autoNumberingForMath
        )
      ) {
        File.option.autoNumberingForMath = false;
      }
      File.option.headingStyle = File.option.headingStyle || 0;
      File.option.ulStyle = File.option.ulStyle || 0;
      File.option.olStyle = File.option.olStyle || 0;
      File.option.wordCountDelimiter = File.option.wordCountDelimiter || 0;
      File.option.sortType = File.option.sortType || 0;
      File.option.indentSize = File.option.indentSize - 0 || 2;
      File.option.codeIndentSize = File.option.codeIndentSize - 0 || 4;
      File.option.curTheme = File.option.curTheme || File.option.theme;
      if (isNaN(File.option.indentSize)) {
        File.option.indentSize = 2;
      }
      if (isNaN(File.option.codeIndentSize)) {
        File.option.codeIndentSize = 4;
      }
      if ((window._options || {}).mountFolder) {
        File.setMountFolder(_options.mountFolder);
      }
      File.setIndentSize(File.option.indentSize);
      if (window.innerWidth < 540) {
        File.option.sidebarTab = null;
      }
      if (File.option.useCustomFontSize) {
        document.body.parentElement.style.fontSize = File.option.customFontSize + 'px';
      }
      File.setCanCollapsePinnedOutline(File.option.canCollapseOutlinePanel);
      if (3 == File.option.headingStyle) {
        document.body.classList.add('use-varible-width-setex');
      }
      if (File.option.noLineWrapping) {
        jquery('#write').addClass('fences-no-line-wrapping');
      }
      if (File.isMac) {
        if ((_options.osVersion || '').indexOf(true)) {
          document.body.classList.add('mac-os-11');
        }
        document.body.classList.add('mac-os');
        bridge.callHandler('window.refreshFullContentState');
      }
      if (File.isNode) {
        File.option.arch = process.arch;
      }
      File.setIndentFirstLine(File.option.indentFirstLine, true);
      File.setHideBrAndLineBreak(File.option.hideBrAndLineBreak || false, true);
      File.isFocusMode = File.option.isFocusMode;
      File.isTypeWriterMode = File.option.isTypeWriterMode;
      File.setIgnoreLineBreak(File.option.ignoreLineBreak || false, true);
      if (File.option.monocolorEmoji) {
        document.body.classList.add('monocolor-emoji');
      }
      if (File.option.indentEmptyP) {
        document.body.classList.add('indent-empty-p');
      }
      fileOptions.setConvertSmartOnRender(File.option.convertSmartOnRender);
      if (File.option.framelessWindow) {
        setTimeout(function () {
          if (jquery.localize.getString) {
            dialogs.showHintOrWarning({
              key: 'noHintForUnibody',
              title: jquery.localize.getString(
                '<strong>Unibody</strong> style has been turned on.',
                'Front',
              ),
              body: jquery.localize.getString(
                'You can right click titlebar to popup application menu.',
                'Front',
              ),
              checked: true,
            });
          }
        }, 1e3);
      }
      if (File.option.supportTextBundle) {
        File.SupportedFiles.push('textbundle');
      }
      if (File.option.supportTextPack) {
        File.SupportedFiles.push('textpack');
      }
      let searchValue = File.FileOption.getDefaultExtension();
      if (-1 == File.SupportedFiles.indexOf(searchValue)) {
        File.SupportedFiles.push(searchValue);
      }
    },
    getDefaultExtension: function () {
      if (File.isTextBundle()) {
        return 'textbundle';
      } else {
        if (File.isTextPack()) {
          return 'textpack';
        } else {
          return File.option.defaultExtension || 'md';
        }
      }
    },
    setDefaultExtension(searchValue) {
      File.option.defaultExtension = searchValue || 'md';
      if (searchValue) {
        if (-1 == File.SupportedFiles.indexOf(searchValue)) {
          File.SupportedFiles.push(searchValue);
        }
        if (File.isNode) {
          File.editor.quickOpenPanel.worker.postMessage(['setDefaultExtension', searchValue]);
        }
        File.editor.quickOpenPanel.cacheFolder(File.getMountFolder());
        File.editor.library.refreshPanelCommand();
      }
    },
    setConvertSmartOnRender: function (convertSmartOnRender) {
      File.option.convertSmartOnRender = convertSmartOnRender;
    },
    setup: function () {
      window.Reporter.install();
      window.Analytics.install();
      if (File.isMac) {
        fileOptions.setupSafari();
        fileOptions.setupBridge();
        fileOptions.setupMouseZoom();
      }
    },
    setupBridge: function () {
      bridge.registerHandler('File.getSuggestedFileName', function (unusedParameter1, reply) {
        reply(File.getSuggestedFileName());
      });
      bridge.registerHandler('File.reloadContent', function (reloadArguments, reply) {
        File.reloadContent.apply(File, reloadArguments);
        reply(null);
      });
      bridge.registerHandler('File.setDocumentState', function (documentState, reply) {
        File.setDocumentState(documentState);
        if (reply) {
          reply(null);
        }
        setTimeout(() => {
          File.editor.imgEdit.updateLocalRootUrl(true);
        }, 100);
      });
      bridge.registerHandler('File.setFilePath', function (pathUpdate, reply) {
        var previousFilePath = pathUpdate[2],
          previousImageStorage =
            File.editor.imgEdit && File.editor.imgEdit.getTargetImageStorageFolder();
        if (File.bundle.filePath != pathUpdate[0]) {
          Reporter.record(
            `File.setFilePath, File.bundle.filePath = ${utilities.hashCode(pathUpdate[0])}`,
          );
        }
        File.bundle.filePath = pathUpdate[0];
        File.bundle.currentFolderPath = pathUpdate[1];
        recovery.onFilePathUpdated(void 0, previousFilePath, previousImageStorage);
        if (reply) {
          reply(null);
        }
      });
      bridge.registerHandler('File.loadFile', async function (documentData, reply) {
        File.loadFile(null, true, documentData);
        if (reply) {
          reply(null);
        }
      });
      bridge.registerHandler('File.generateSnapForBackup', function (unusedParameter1, reply) {
        try {
          reply(File._needsUpdateSnap ? File.generateSnap() : null);
        } catch (error) {
          console.sendError(error, 'warning');
          reply('ERROR');
        }
        File._needsUpdateSnap = false;
      });
      bridge.registerHandler('File.syncContent', function (editedOverride, reply) {
        if (false === File.validateContentForSave()) {
          Reporter.record('handler File.syncContent');
          File.showDataLostError();
        }
        reply(File.syncContentForSave(editedOverride));
      });
    },
    setupMouseZoom: function () {
      window.addEventListener(
        'wheel',
        function (keyboardEvent) {
          if (keyboardEvent.metaKey && File.option.zoomByMouse) {
            if (keyboardEvent.deltaY > 3) {
              throttledZoom(1);
            } else {
              if (keyboardEvent.deltaY < -3) {
                throttledZoom(-1);
              }
            }
          }
        },
        !!File.option.passiveEvents && { passive: true },
      );
    },
    setupSafari: function () {
      File.option.passiveEvents = true;
    },
    shouldRemapPunctuation: function () {
      return (
        File.option.remapUnicodePunctuation ||
        (!File.option.convertSmartOnRender && (File.option.smartQuote || File.option.smartDash))
      );
    },
    setFinalNewline: function (finalNewline) {
      if (!File.finalNewline != !finalNewline) {
        File.finalNewline = finalNewline;
        var optionCommand = undoManager.makeEmptyCommand();
        optionCommand.undo.push({ type: 'option', option: 'finalNewline', value: !finalNewline });
        optionCommand.redo.push({
          type: 'option',
          option: 'finalNewline',
          value: finalNewline,
        });
        File.editor.undo.register(optionCommand);
      }
    },
    setIndentFirstLine: function (indentFirstLine, refreshMenu, persistSetting) {
      File.option.indentFirstLine = indentFirstLine;
      if (File.option.indentFirstLine) {
        File.editor.writingArea.classList.add('first-line-indent');
      } else {
        File.editor.writingArea.classList.remove('first-line-indent');
      }
      if (refreshMenu) {
        JSBridge.menu.update('Edit→Whitespace and Line Breaks→Indent first line of paragraphs', {
          state: File.option.indentFirstLine,
        });
        documentMenu.forceRefreshMenu();
      }
      if (persistSetting) {
        JSBridge.putSetting('indentFirstLine', indentFirstLine);
      }
    },
    setHideBrAndLineBreak: function (hideBrAndLineBreak, refreshMenu, persistSetting) {
      File.option.hideBrAndLineBreak = hideBrAndLineBreak;
      if (File.option.hideBrAndLineBreak) {
        document.body.classList.add('hide-br-and-line-break');
      } else {
        document.body.classList.remove('hide-br-and-line-break');
      }
      if (refreshMenu) {
        JSBridge.menu.update('Edit→Whitespace and Line Breaks→Visible <br/>', {
          state: !File.option.hideBrAndLineBreak,
        });
        documentMenu.forceRefreshMenu();
      }
      if (persistSetting) {
        JSBridge.putSetting('hideBrAndLineBreak', hideBrAndLineBreak);
      }
    },
    setIgnoreLineBreak: function (ignoreLineBreak, refreshMenu, persistSetting) {
      if ((ignoreLineBreak = 1 == ignoreLineBreak || 'true' == ignoreLineBreak)) {
        document.body.classList.add('ignore-line-break');
      } else {
        document.body.classList.remove('ignore-line-break');
      }
      if (File.option.ignoreLineBreak != ignoreLineBreak) {
        if (ignoreLineBreak) {
          jquery('.md-softbreak').html("<span contenteditable='false'></span>\n");
        } else {
          jquery('.md-softbreak-emptyline').replaceWith(
            "&#10;<span md-inline='emptyline' class='md-emptyline'>&#10;</span>",
          );
          jquery('.md-softbreak [contenteditable]').remove();
        }
      }
      File.option.ignoreLineBreak = ignoreLineBreak;
      if (persistSetting) {
        JSBridge.putSetting('ignoreLineBreak', ignoreLineBreak);
      }
      if (refreshMenu) {
        JSBridge.menu.update('Edit→Whitespace and Line Breaks→Preserve single line break', {
          state: !ignoreLineBreak,
        });
        documentMenu.forceRefreshMenu();
      }
    },
    setIndentSize: function (indentSize) {
      File.option.indentSize = (indentSize || 2) - 0;
      if (File.option.indentSize < 0) {
        File.option.indentSize = 2;
        File.option.indentByTab = true;
      } else {
        File.option.indentByTab = false;
      }
    },
    setLineEnding: function (useCRLF, rewriteContent, forceUpdate) {
      if (useCRLF != File.useCRLF || forceUpdate) {
        File.useCRLF = useCRLF;
        var lineEndingMenu = {
          'Edit→Line Endings→Windows Line Endings (CRLF)': {
            state: File.useCRLF,
            enabled: !File.isLocked,
          },
          'Edit→Line Endings→Unix Line Endings (LF)': {
            state: !File.useCRLF,
            enabled: !File.isLocked,
          },
        };
        JSBridge.menu.update(lineEndingMenu);
        if (rewriteContent) {
          File.sync();
          var markdown = File.editor.getMarkdown();
          markdown = (markdown.split(/\r?\n/g) || [markdown]).join(File.useCRLF ? '\r\n' : '\n');
          File.reloadContent(markdown);
          File.needSaveState = true;
          File.backupWindow();
        }
      }
    },
    setTheme: function (curTheme) {
      File.colorBrightness = 1;
      var finishThemeUpdate = Object.defineProperty(
          function () {
            jquery('#bg_css').remove();
            console.debug('updateWebView after setTheme');
            setTimeout(() => {
              !(function () {
                Object.defineProperty(toHexColorChannel, 'name', {
                  value: 'o',
                  configurable: true,
                });

                var redChannel,
                  greenChannel,
                  blueChannel,
                  mappedItems = (
                    window.getComputedStyle(document.body).backgroundColor.match(/[\d.]+/gi) || []
                  ).map(function (item) {
                    return item - 0;
                  });
                function toHexColorChannel(colorChannel) {
                  var upperCaseText = Number(colorChannel).toString(16).toUpperCase();
                  if (1 == upperCaseText.length) {
                    return '0' + upperCaseText;
                  } else {
                    return upperCaseText;
                  }
                }
                if (!(void 0 !== mappedItems[3] && null !== mappedItems[3])) {
                  mappedItems[3] = 1;
                }
                if (mappedItems.length) {
                  File.colorBrightness =
                    (299 * mappedItems[0] + 587 * mappedItems[1] + 114 * mappedItems[2]) / 256e3;
                  if (File.isMac) {
                    console.debug('background', mappedItems);
                    if (mappedItems[0] + mappedItems[1] + mappedItems[2] + mappedItems[3] == 0) {
                      mappedItems = [255, 255, 255, 0];
                    }
                    bridge.callHandler('window.setBackground', mappedItems);
                    bridge.callHandler('window.setIsSchemeAwareness', findThemeStylesheetRules());
                  } else {
                    JSBridge.invoke(
                      'theme.setThemeSource',
                      File.colorBrightness < 0.5 ? 'dark' : 'system',
                    );
                    JSBridge.putSetting(
                      'backgroundColor',
                      ((redChannel = mappedItems[0]),
                      (greenChannel = mappedItems[1]),
                      (blueChannel = mappedItems[2]),
                      '#' +
                        toHexColorChannel(redChannel) +
                        toHexColorChannel(greenChannel) +
                        toHexColorChannel(blueChannel)),
                    );
                    JSBridge.putSetting('isDarkMode', File.colorBrightness < 0.5);
                  }
                }
                if (File.isMac) {
                  var titlebarLeftInset = null;
                  if (
                    'true' !=
                      (
                        window
                          .getComputedStyle(document.body)
                          .getPropertyValue('--marklyra-center-window-title') || ''
                      ).trim() &&
                    document.body.classList.contains('pin-outline')
                  ) {
                    titlebarLeftInset = document
                      .querySelector('#marklyra-sidebar')
                      .getBoundingClientRect().width;
                  }
                  bridge.callHandler('window.setTitlebarTextMarginLeft', titlebarLeftInset);
                }
              })();
              if (!File._onInitTheme) {
                File.editor.refresh(true);
              }
              File._onInitTheme = false;
              if (File.isNode && File.megaMenu) {
                File.megaMenu.applyTheme();
              }
            }, 100);
            if (File.isFocusMode) {
              File.editor.updateFocusMode(File.isFocusMode);
            }
            if (File.isTypeWriterMode) {
              File.editor.setTypeWriterMode(true, true);
            }
          },
          'name',
          { value: 't', configurable: true },
        ),
        findThemeStylesheetRules = Object.defineProperty(
          function () {
            var themeLink = document.getElementById('theme_css');
            for (var stylesheet of document.styleSheets) {
              if (stylesheet.href === themeLink.href && themeLink.href) {
                for (var cssRule of stylesheet.rules) {
                  if (4 === cssRule.type && /prefers\-color\-scheme/.exec(cssRule.cssText || '')) {
                    return true;
                  }
                }
              }
            }
            return false;
          },
          'name',
          { value: 'n', configurable: true },
        );
      if (File.isMac) {
        var element = document.getElementById('theme_css'),
          linkTarget = element.getAttribute('href'),
          themeFolderUrl = 'file://' + _options.currentThemeFolder;
        curTheme = (curTheme = curTheme || File.option.curTheme || 'github')
          .replace(/\s*([A-Z])/g, '-$1')
          .replace(/^-/, '')
          .toLowerCase();
        File.option.curTheme = curTheme;
        if (File.option.useCustomFontSize) {
          var fontSizeText = (File.option.customFontSize || 16) + '';
          document.body.parentElement.style.fontSize = fontSizeText + 'px';
        } else {
          document.body.parentElement.style.fontSize = '';
        }
        linkTarget = (/([^\\\/]+)\.css$/.exec(linkTarget) || [])[1];
        console.debug(' change from ' + linkTarget + ' to ' + curTheme);
        if (linkTarget != curTheme) {
          element.setAttribute('href', themeFolderUrl + '/' + curTheme + '.css');
        }
        setTimeout(finishThemeUpdate, 20);
        document
          .querySelector('#base_user_css')
          .setAttribute('href', themeFolderUrl + '/base.user.css');
        document
          .querySelector('#theme_user_css')
          .setAttribute('href', themeFolderUrl + '/' + curTheme + '.user.css');
      } else {
        if (File.isNode) {
          File.option.curTheme = curTheme || File.option.curTheme || 'github.css';
          curTheme = File.option.curTheme.replace(/\.css$/, '');
          var userDataUrl = 'marklyra://app/userData',
            separator = File.isWin ? '\\' : '/';
          jquery('#theme_css').attr(
            'href',
            [userDataUrl, 'themes', curTheme + '.css'].join(separator),
          );
          setTimeout(finishThemeUpdate, 20);
          document
            .querySelector('#base_user_css')
            .setAttribute('href', [userDataUrl, 'themes', 'base.user.css'].join(separator));
          document
            .querySelector('#theme_user_css')
            .setAttribute('href', [userDataUrl, 'themes', curTheme + '.user.css'].join(separator));
          if (File.isMacNode) {
            JSBridge.invoke('menu.refreshThemeMenu');
          }
        }
      }
      document.body.style.backgroundColor = '';
      document.body.style.setProperty('--bg-color', '');
    },
    setCanCollapsePinnedOutline: function (canCollapseOutlinePanel) {
      if (canCollapseOutlinePanel) {
        document.body.classList.remove('no-collapse-outline');
      } else {
        document.body.classList.add('no-collapse-outline');
      }
      File.option.canCollapseOutlinePanel = canCollapseOutlinePanel;
      if (this.editor && this.editor.nodeMap && this.editor.nodeMap.toc) {
        this.editor.nodeMap.toc.updateHTML(true);
      }
    },
    decideLineEnding: function (text) {
      var detectedCRLF = text.indexOf('\r\n') > -1 || (!(text.indexOf('\n') > -1) && null);
      if (null !== detectedCRLF) {
        File.setLineEnding(detectedCRLF);
      } else {
        var preferredCRLF = File.editor.localSettingBridge
          ? File.editor.localSettingBridge.preferCRLF()
          : File.option.preferCRLF;
        File.setLineEnding(preferredCRLF);
      }
      var textLength = text.length,
        finalNewline = File.editor.localSettingBridge
          ? File.editor.localSettingBridge.preferFinalNewline()
          : File.option.preferFinalNewline;
      if (textLength) {
        File.finalNewline = '\n' == text.substr(textLength - 1);
        if (text.length > 1 && '\n' == text.substr(textLength - 2)) {
          File.finalNewline = finalNewline;
        } else {
          if (text.length > 1 && '\r' == text.substr(textLength - 2)) {
            if (text.length > 2 && text.substr(textLength - 3)) {
              File.finalNewline = '\n' == text.substr(textLength - 3);
            } else {
              File.finalNewline = finalNewline;
            }
          }
        }
      } else {
        File.finalNewline = finalNewline;
      }
    },
    setDefaultImageStorage: function (defaultImageStorage) {
      File.option.defaultImageStorage = defaultImageStorage;
      if (File.editor.imgEdit) {
        File.editor.imgEdit.cachedFileImageStorage = null;
      }
    },
    exitOversize: function () {
      var element = document.querySelector('#marklyra-oversize-body');
      if (element && !element.style.display) {
        element.style.display = 'none';
        console.sendLog('[exitOversize]');
      }
      File.bundle.unsupported = false;
    },
    doEnterOversize: function (fromBroadcast) {
      console.sendLog(`[doEnterOversize] ${fromBroadcast ? 'fromBroadcast' : 'fromSelf'}`);
      document.querySelector('#marklyra-oversize-body').style.display = '';
      File.bundle.unsupported = File.UNSUPPORTED_REASON.OVERSIZE;
      if (File.isNode && !fromBroadcast) {
        JSBridge.invoke('document.addSnap', null);
      }
    },
    tryEnterOversize: function (sourceText, forceOversize, fromBroadcast) {
      if (File.isMac && !File.bundle.filePath) {
        File.exitOversize();
        return sourceText;
      } else {
        fileIntegration.bindOversizePlaceholder();
        if (forceOversize || sourceText.length > File.MAX_FILE_SIZE) {
          File.doEnterOversize(fromBroadcast);
          return '';
        } else {
          File.exitOversize();
          return sourceText;
        }
      }
    },
    recoverPosOrScroll: function (savedPosition) {
      console.debug('File.bundle.filePath', File.bundle.filePath);
      var cachedPosition = File.editor.library.cursorBackups[File.bundle.filePath || ''];
      if (
        savedPosition &&
        ((savedPosition.cursorPos && 'null' !== savedPosition.cursorPos) ||
          savedPosition.scrollOffset) &&
        (!cachedPosition || cachedPosition.date < savedPosition.timeStamp)
      ) {
        if (
          !(
            !savedPosition.cursorPos ||
            'null' === savedPosition.cursorPos ||
            ('INPUT' === document.activeElement.tagName &&
              document.activeElement.closest('#sidebar-content'))
          )
        ) {
          File.editor.undo.exeCommand(JSON.parse(savedPosition.cursorPos));
          File.editor.selection.scrollAdjust();
        }
        if (void 0 != savedPosition.scrollOffset) {
          console.debug('recoverPosOrScroll', savedPosition.scrollOffset);
          jquery('content').scrollTop(savedPosition.scrollOffset);
        }
      } else {
        if (cachedPosition) {
          console.debug('recoverPosOrScroll', cachedPosition);
          if (cachedPosition.type) {
            File.editor.undo.exeCommand(cachedPosition);
            File.editor.selection.scrollAdjust();
          } else {
            window.getSelection().removeAllRanges();
          }
          if (void 0 != cachedPosition.scrollOffset) {
            jquery('content').scrollTop(cachedPosition.scrollOffset);
          }
        } else {
          if (!(window._hasSwitchCallback || isInputComponent(document.activeElement))) {
            window.getSelection().removeAllRanges();
            File.editor.writingArea.focus();
            jquery('content').scrollTop(0);
          }
        }
      }
    },
    getFileName: function (useSuggestedName) {
      if (File.isMac) {
        var filePath = File.bundle.filePath,
          currentFolderPath = File.bundle.currentFolderPath,
          relativeFileName = void 0;
        if (filePath && currentFolderPath) {
          relativeFileName = filePath.replace(currentFolderPath, '').replace(/^\//g, '');
        }
        return relativeFileName || (useSuggestedName ? File.getSuggestedFileName() : void 0);
      }
      if (File.bundle.fileName) {
        return File.bundle.fileName;
      } else {
        if (File.bundle.filePath) {
          File.bundle.fileName = fileIntegration.getFileNameFromPath(File.bundle.filePath);
          return File.bundle.fileName;
        } else {
          if (useSuggestedName) {
            return File.getSuggestedFileName();
          } else {
            return void 0;
          }
        }
      }
    },
    getSuggestedFileName: function (preferCurrentName) {
      if (File.bundle.fileName) {
        return File.bundle.fileName.replace(/\.[^.]+$/, '');
      }
      if (preferCurrentName) {
        var text = File.getFileName();
        if (text) {
          return text.replace(/\.[^.]+$/, '');
        }
      }
      var headingElement,
        metadataNode,
        currentText = '',
        datePrefix = '';
      try {
        if ((metadataNode = File.editor.docMenu.getMetaNode())) {
          datePrefix = File.editor.docMenu.getValueInMeta('date', metadataNode) || '';
          datePrefix = (/\d+-\d+-\d+/g.exec(datePrefix) ||
            /\d+\/\d+\/\d+/g.exec(datePrefix) || [''])[0];
          currentText = (currentText =
            File.editor.docMenu.getValueInMeta('title', metadataNode) || '')
            .replace(/(^\s*("|'))|(("|')\s*)/gi, '')
            .replace(/\s+(.)/gi, '-$1')
            .toLocaleString();
          currentText =
            datePrefix && currentText ? [datePrefix, currentText].join('-') : currentText;
        }
        if (!(0 != currentText.trim().length && '-' != currentText)) {
          headingElement = jquery(
            jquery(
              "[mdlike='h1'], [mdlike='h2'], [mdlike='h3'], #write h1, #write h2, #write h3",
            )[0],
          );
          if (File.editor.sourceView.inSourceMode) {
            if (
              (currentText =
                (currentText = File.editor.getMarkdown()).substring(0, currentText.indexOf('\n')) ||
                currentText).length > 60
            ) {
              currentText = currentText.substring(0, currentText.indexOf('.')) || currentText;
            }
          } else {
            if (headingElement.length) {
              currentText = File.editor.UserOp.getDisplayText(headingElement).replace(
                /\r?\n/gi,
                '',
              );
            } else {
              if (
                (currentText =
                  (currentText = (headingElement = jquery(jquery('[cid]:not(.md-meta-block)')[0]))
                    .length
                    ? File.editor.UserOp.getDisplayText(headingElement)
                    : '').substring(0, currentText.indexOf('\n')) || currentText).length > 60
              ) {
                currentText = currentText.substring(0, currentText.indexOf('.')) || currentText;
              }
            }
          }
        }
        if (currentText.length > 120) {
          currentText = currentText.substring(0, 120);
        }
      } catch (error) {}
      if (0 == currentText.trim().length) {
        currentText = jquery.localize.getString('Untitled', 'Front');
      }
      return utilities.removeInvalidPathCh(currentText.trim()) || 'Untitled';
    },
  };
  moduleRecord.exports = fileOptions;
}
