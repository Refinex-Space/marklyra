// document/options.
// SystemJS module 36. Dependencies: e, 11, 1b, 2c, 29, 33, 37, 38, 35.
$__System.registerDynamic(
  '36',
  ['e', '11', '1b', '2c', '29', '33', '37', '38', '35'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var jquery = requireModule('e'),
      utilities = requireModule('11'),
      undoManager = requireModule('1b'),
      dialogs = (requireModule('2c'), requireModule('29')),
      fileIntegration = requireModule('33'),
      documentMenu = requireModule('37'),
      localDiagnostics = requireModule('38'),
      recovery = requireModule('35'),
      Reporter = localDiagnostics.Reporter;
    const throttledZoom = (function (zoomCallback, delay) {
      let cooldownTimer = null;
      return (...callbackArguments) => {
        null === cooldownTimer &&
          (zoomCallback(...callbackArguments),
          (cooldownTimer = setTimeout(() => {
            cooldownTimer = null;
          }, delay)));
      };
    })(function (zoomDirection) {
      zoomDirection < 0 ? JSBridge.zoom.zoomIn() : JSBridge.zoom.zoomOut();
    }, 500);
    var fileOptions = {
      DEFAULT_OPTIONS: {
        keys: {},
        indentByTab: !1,
        indentSize: 2,
        codeIndentSize: 4,
        enableInlineMath: !0,
        autoNumberingForMath: !1,
        enableHighlight: !1,
        enableSubscript: !1,
        enableSuperscript: !1,
        enableDiagram: !1,
        enableAlert: !0,
        copyMarkdownByDefault: !1,
        showLineNumbersForFence: !1,
        useRelativePathForImg: !1,
        autoCorrectMisspell: !1,
        noPairingMatch: !1,
        autoPairExtendSymbol: !1,
        enableAutoSave: !1,
        scrollWithCursor: !1,
        expandSimpleBlock: !1,
        allowImageMove: !0,
        allowImageUpload: !0,
        headingStyle: 0,
        ulStyle: 0,
        olStyle: 0,
        strictMarkdown: !1,
        preferCRLF: !1,
        sortType: 0,
        sidebarTab: '',
        useTreeStyle: !1,
        noLineWrapping: !1,
        prettyIndent: !1,
        defaultImageStorage: null,
        applyImageMoveForWeb: !1,
        applyImageMoveForLocal: !0,
        ignoreLineBreak: !1,
        preLinebreakOnExport: !1,
        hideBrAndLineBreak: !1,
        indentFirstLine: !1,
        monocolorEmoji: !1,
        useFsQueue: !0,
        isLocked: !1,
        convertSmartOnRender: !1,
        remapUnicodePunctuation: !1,
        smartDash: !1,
        smartQuote: !1,
        userQuotesArray: null,
        autoResizeIframe: !0,
        blockHTML: !0,
        sendAnonymousUsage: !0,
        presetSpellCheck: 'auto',
        sidebarWidth: null,
        caseSensitive: !1,
        wholeWord: !1,
        fileSearchCaseSensitive: !1,
        fileSearchWholeWord: !1,
        wordCountDelimiter: 0,
        listNoGroup: !1,
        treeNoGroup: !1,
        wordsPerMinute: 382,
        autoEscapeImageURL: !1,
        mathFormatOnCopy: 'svg',
        gitlabMath: !0,
        spellcheckForCodeAndLink: !1,
        preferFinalNewline: !1,
        htmlMath: !1,
        strictNumberStartOnNewLine: !1,
        noDisplayLinesInMath: !1,
        lineWiseCopyCut: !1,
        noAutoLink: !1,
        defaultExtension: 'md',
        defaultCodeLang: '',
        defaultCodeLangOption: 1,
        DefaultCodeLangOptionCode: 1,
        DefaultCodeLangOptionMenu: 2,
        noLegacyMath: !1,
        noEmojiAutoComplete: !1,
        zoomByMouse: !1,
      },
      readOption: function () {
        window._options && (File.option = jquery.extend(File.option, window._options)),
          window._documentState && File.setDocumentState(_documentState);
        var autoNumberingForMath = (window._options || {}).autoNumberingForMath;
        (File.option.autoNumberingForMath = !!autoNumberingForMath && 'all'),
          'ams' == autoNumberingForMath && (File.option.autoNumberingForMath = 'ams'),
          ('0' != autoNumberingForMath &&
            'none' != autoNumberingForMath &&
            'null' != autoNumberingForMath &&
            'false' != autoNumberingForMath &&
            'nil' != autoNumberingForMath) ||
            (File.option.autoNumberingForMath = !1),
          (File.option.headingStyle = File.option.headingStyle || 0),
          (File.option.ulStyle = File.option.ulStyle || 0),
          (File.option.olStyle = File.option.olStyle || 0),
          (File.option.wordCountDelimiter = File.option.wordCountDelimiter || 0),
          (File.option.sortType = File.option.sortType || 0),
          (File.option.indentSize = File.option.indentSize - 0 || 2),
          (File.option.codeIndentSize = File.option.codeIndentSize - 0 || 4),
          (File.option.curTheme = File.option.curTheme || File.option.theme),
          isNaN(File.option.indentSize) && (File.option.indentSize = 2),
          isNaN(File.option.codeIndentSize) && (File.option.codeIndentSize = 4),
          (window._options || {}).mountFolder && File.setMountFolder(_options.mountFolder),
          File.setIndentSize(File.option.indentSize),
          window.innerWidth < 540 && (File.option.sidebarTab = null),
          File.option.useCustomFontSize &&
            (document.body.parentElement.style.fontSize = File.option.customFontSize + 'px'),
          File.setCanCollapsePinnedOutline(File.option.canCollapseOutlinePanel),
          3 == File.option.headingStyle && document.body.classList.add('use-varible-width-setex'),
          File.option.noLineWrapping && jquery('#write').addClass('fences-no-line-wrapping'),
          File.isMac &&
            ((_options.osVersion || '').indexOf(!0) && document.body.classList.add('mac-os-11'),
            document.body.classList.add('mac-os'),
            bridge.callHandler('window.refreshFullContentState')),
          File.isNode && (File.option.arch = process.arch),
          File.setIndentFirstLine(File.option.indentFirstLine, !0),
          File.setHideBrAndLineBreak(File.option.hideBrAndLineBreak || !1, !0),
          (File.isFocusMode = File.option.isFocusMode),
          (File.isTypeWriterMode = File.option.isTypeWriterMode),
          File.setIgnoreLineBreak(File.option.ignoreLineBreak || !1, !0),
          File.option.monocolorEmoji && document.body.classList.add('monocolor-emoji'),
          File.option.indentEmptyP && document.body.classList.add('indent-empty-p'),
          fileOptions.setConvertSmartOnRender(File.option.convertSmartOnRender),
          File.option.framelessWindow &&
            setTimeout(function () {
              jquery.localize.getString &&
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
                  checked: !0,
                });
            }, 1e3),
          File.option.supportTextBundle && File.SupportedFiles.push('textbundle'),
          File.option.supportTextPack && File.SupportedFiles.push('textpack');
        let searchValue = File.FileOption.getDefaultExtension();
        -1 == File.SupportedFiles.indexOf(searchValue) && File.SupportedFiles.push(searchValue);
      },
      getDefaultExtension: function () {
        return File.isTextBundle()
          ? 'textbundle'
          : File.isTextPack()
            ? 'textpack'
            : File.option.defaultExtension || 'md';
      },
      setDefaultExtension(searchValue) {
        (File.option.defaultExtension = searchValue || 'md'),
          searchValue &&
            (-1 == File.SupportedFiles.indexOf(searchValue) &&
              File.SupportedFiles.push(searchValue),
            File.isNode &&
              File.editor.quickOpenPanel.worker.postMessage(['setDefaultExtension', searchValue]),
            File.editor.quickOpenPanel.cacheFolder(File.getMountFolder()),
            File.editor.library.refreshPanelCommand());
      },
      setConvertSmartOnRender: function (convertSmartOnRender) {
        File.option.convertSmartOnRender = convertSmartOnRender;
      },
      setup: function () {
        window.Reporter.install(),
          window.Analytics.install(),
          File.isMac &&
            (fileOptions.setupSafari(), fileOptions.setupBridge(), fileOptions.setupMouseZoom());
      },
      setupBridge: function () {
        bridge.registerHandler('File.getSuggestedFileName', function (unusedParameter1, reply) {
          reply(File.getSuggestedFileName());
        }),
          bridge.registerHandler('File.reloadContent', function (reloadArguments, reply) {
            File.reloadContent.apply(File, reloadArguments), reply(null);
          }),
          bridge.registerHandler('File.setDocumentState', function (documentState, reply) {
            File.setDocumentState(documentState),
              reply && reply(null),
              setTimeout(() => {
                File.editor.imgEdit.updateLocalRootUrl(!0);
              }, 100);
          }),
          bridge.registerHandler('File.setFilePath', function (pathUpdate, reply) {
            var previousFilePath = pathUpdate[2],
              previousImageStorage =
                File.editor.imgEdit && File.editor.imgEdit.getTargetImageStorageFolder();
            File.bundle.filePath != pathUpdate[0] &&
              Reporter.record(
                `File.setFilePath, File.bundle.filePath = ${utilities.hashCode(pathUpdate[0])}`,
              ),
              (File.bundle.filePath = pathUpdate[0]),
              (File.bundle.currentFolderPath = pathUpdate[1]),
              recovery.onFilePathUpdated(void 0, previousFilePath, previousImageStorage),
              reply && reply(null);
          }),
          bridge.registerHandler('File.loadFile', async function (documentData, reply) {
            File.loadFile(null, !0, documentData), reply && reply(null);
          }),
          bridge.registerHandler('File.generateSnapForBackup', function (unusedParameter1, reply) {
            try {
              reply(File._needsUpdateSnap ? File.generateSnap() : null);
            } catch (error) {
              console.sendError(error, 'warning'), reply('ERROR');
            }
            File._needsUpdateSnap = !1;
          }),
          bridge.registerHandler('File.syncContent', function (editedOverride, reply) {
            !1 === File.validateContentForSave() &&
              (Reporter.record('handler File.syncContent'), File.showDataLostError()),
              reply(File.syncContentForSave(editedOverride));
          });
      },
      setupMouseZoom: function () {
        window.addEventListener(
          'wheel',
          function (keyboardEvent) {
            keyboardEvent.metaKey &&
              File.option.zoomByMouse &&
              (keyboardEvent.deltaY > 3
                ? throttledZoom(1)
                : keyboardEvent.deltaY < -3 && throttledZoom(-1));
          },
          !!File.option.passiveEvents && { passive: !0 },
        );
      },
      setupSafari: function () {
        File.option.passiveEvents = !0;
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
          optionCommand.undo.push({ type: 'option', option: 'finalNewline', value: !finalNewline }),
            optionCommand.redo.push({
              type: 'option',
              option: 'finalNewline',
              value: finalNewline,
            }),
            File.editor.undo.register(optionCommand);
        }
      },
      setIndentFirstLine: function (indentFirstLine, refreshMenu, persistSetting) {
        (File.option.indentFirstLine = indentFirstLine),
          File.option.indentFirstLine
            ? File.editor.writingArea.classList.add('first-line-indent')
            : File.editor.writingArea.classList.remove('first-line-indent'),
          refreshMenu &&
            (JSBridge.menu.update(
              'Edit→Whitespace and Line Breaks→Indent first line of paragraphs',
              { state: File.option.indentFirstLine },
            ),
            documentMenu.forceRefreshMenu()),
          persistSetting && JSBridge.putSetting('indentFirstLine', indentFirstLine);
      },
      setHideBrAndLineBreak: function (hideBrAndLineBreak, refreshMenu, persistSetting) {
        (File.option.hideBrAndLineBreak = hideBrAndLineBreak),
          File.option.hideBrAndLineBreak
            ? document.body.classList.add('hide-br-and-line-break')
            : document.body.classList.remove('hide-br-and-line-break'),
          refreshMenu &&
            (JSBridge.menu.update('Edit→Whitespace and Line Breaks→Visible <br/>', {
              state: !File.option.hideBrAndLineBreak,
            }),
            documentMenu.forceRefreshMenu()),
          persistSetting && JSBridge.putSetting('hideBrAndLineBreak', hideBrAndLineBreak);
      },
      setIgnoreLineBreak: function (ignoreLineBreak, refreshMenu, persistSetting) {
        (ignoreLineBreak = 1 == ignoreLineBreak || 'true' == ignoreLineBreak)
          ? document.body.classList.add('ignore-line-break')
          : document.body.classList.remove('ignore-line-break'),
          File.option.ignoreLineBreak != ignoreLineBreak &&
            (ignoreLineBreak
              ? jquery('.md-softbreak').html("<span contenteditable='false'></span>\n")
              : (jquery('.md-softbreak-emptyline').replaceWith(
                  "&#10;<span md-inline='emptyline' class='md-emptyline'>&#10;</span>",
                ),
                jquery('.md-softbreak [contenteditable]').remove())),
          (File.option.ignoreLineBreak = ignoreLineBreak),
          persistSetting && JSBridge.putSetting('ignoreLineBreak', ignoreLineBreak),
          refreshMenu &&
            (JSBridge.menu.update('Edit→Whitespace and Line Breaks→Preserve single line break', {
              state: !ignoreLineBreak,
            }),
            documentMenu.forceRefreshMenu());
      },
      setIndentSize: function (indentSize) {
        (File.option.indentSize = (indentSize || 2) - 0),
          File.option.indentSize < 0
            ? ((File.option.indentSize = 2), (File.option.indentByTab = !0))
            : (File.option.indentByTab = !1);
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
          if ((JSBridge.menu.update(lineEndingMenu), rewriteContent)) {
            File.sync();
            var markdown = File.editor.getMarkdown();
            (markdown = (markdown.split(/\r?\n/g) || [markdown]).join(
              File.useCRLF ? '\r\n' : '\n',
            )),
              File.reloadContent(markdown),
              (File.needSaveState = !0),
              File.backupWindow();
          }
        }
      },
      setTheme: function (curTheme) {
        File.colorBrightness = 1;
        var t = function () {
            jquery('#bg_css').remove(),
              console.debug('updateWebView after setTheme'),
              setTimeout(() => {
                !(function () {
                  var redChannel,
                    greenChannel,
                    blueChannel,
                    mappedItems = (
                      window.getComputedStyle(document.body).backgroundColor.match(/[\d.]+/gi) || []
                    ).map(function (item) {
                      return item - 0;
                    });
                  function o(colorChannel) {
                    var upperCaseText = Number(colorChannel).toString(16).toUpperCase();
                    return 1 == upperCaseText.length ? '0' + upperCaseText : upperCaseText;
                  }
                  if (
                    ((void 0 !== mappedItems[3] && null !== mappedItems[3]) || (mappedItems[3] = 1),
                    mappedItems.length &&
                      ((File.colorBrightness =
                        (299 * mappedItems[0] + 587 * mappedItems[1] + 114 * mappedItems[2]) /
                        256e3),
                      File.isMac
                        ? (console.debug('background', mappedItems),
                          mappedItems[0] + mappedItems[1] + mappedItems[2] + mappedItems[3] == 0 &&
                            (mappedItems = [255, 255, 255, 0]),
                          bridge.callHandler('window.setBackground', mappedItems),
                          bridge.callHandler('window.setIsSchemeAwareness', n()))
                        : (JSBridge.invoke(
                            'theme.setThemeSource',
                            File.colorBrightness < 0.5 ? 'dark' : 'system',
                          ),
                          JSBridge.putSetting(
                            'backgroundColor',
                            ((redChannel = mappedItems[0]),
                            (greenChannel = mappedItems[1]),
                            (blueChannel = mappedItems[2]),
                            '#' + o(redChannel) + o(greenChannel) + o(blueChannel)),
                          ),
                          JSBridge.putSetting('isDarkMode', File.colorBrightness < 0.5))),
                    File.isMac)
                  ) {
                    var titlebarLeftInset = null;
                    'true' !=
                      (
                        window
                          .getComputedStyle(document.body)
                          .getPropertyValue('--marklyra-center-window-title') || ''
                      ).trim() &&
                      document.body.classList.contains('pin-outline') &&
                      (titlebarLeftInset = document
                        .querySelector('#marklyra-sidebar')
                        .getBoundingClientRect().width),
                      bridge.callHandler('window.setTitlebarTextMarginLeft', titlebarLeftInset);
                  }
                })(),
                  File._onInitTheme || File.editor.refresh(!0),
                  (File._onInitTheme = !1),
                  File.isNode && File.megaMenu && File.megaMenu.applyTheme();
              }, 100),
              File.isFocusMode && File.editor.updateFocusMode(File.isFocusMode),
              File.isTypeWriterMode && File.editor.setTypeWriterMode(!0, !0);
          },
          n = function () {
            var themeLink = document.getElementById('theme_css');
            for (var stylesheet of document.styleSheets)
              if (stylesheet.href === themeLink.href && themeLink.href)
                for (var cssRule of stylesheet.rules)
                  if (4 === cssRule.type && /prefers\-color\-scheme/.exec(cssRule.cssText || ''))
                    return !0;
            return !1;
          };
        if (File.isMac) {
          var element = document.getElementById('theme_css'),
            linkTarget = element.getAttribute('href'),
            themeFolderUrl = 'file://' + _options.currentThemeFolder;
          if (
            ((curTheme = (curTheme = curTheme || File.option.curTheme || 'github')
              .replace(/\s*([A-Z])/g, '-$1')
              .replace(/^-/, '')
              .toLowerCase()),
            (File.option.curTheme = curTheme),
            File.option.useCustomFontSize)
          ) {
            var fontSizeText = (File.option.customFontSize || 16) + '';
            document.body.parentElement.style.fontSize = fontSizeText + 'px';
          } else document.body.parentElement.style.fontSize = '';
          (linkTarget = (/([^\\\/]+)\.css$/.exec(linkTarget) || [])[1]),
            console.debug(' change from ' + linkTarget + ' to ' + curTheme),
            linkTarget != curTheme &&
              element.setAttribute('href', themeFolderUrl + '/' + curTheme + '.css'),
            setTimeout(t, 20),
            document
              .querySelector('#base_user_css')
              .setAttribute('href', themeFolderUrl + '/base.user.css'),
            document
              .querySelector('#theme_user_css')
              .setAttribute('href', themeFolderUrl + '/' + curTheme + '.user.css');
        } else if (File.isNode) {
          (File.option.curTheme = curTheme || File.option.curTheme || 'github.css'),
            (curTheme = File.option.curTheme.replace(/\.css$/, ''));
          var userDataUrl = 'marklyra://app/userData',
            separator = File.isWin ? '\\' : '/';
          jquery('#theme_css').attr(
            'href',
            [userDataUrl, 'themes', curTheme + '.css'].join(separator),
          ),
            setTimeout(t, 20),
            document
              .querySelector('#base_user_css')
              .setAttribute('href', [userDataUrl, 'themes', 'base.user.css'].join(separator)),
            document
              .querySelector('#theme_user_css')
              .setAttribute(
                'href',
                [userDataUrl, 'themes', curTheme + '.user.css'].join(separator),
              ),
            File.isMacNode && JSBridge.invoke('menu.refreshThemeMenu');
        }
        (document.body.style.backgroundColor = ''),
          document.body.style.setProperty('--bg-color', '');
      },
      setCanCollapsePinnedOutline: function (canCollapseOutlinePanel) {
        canCollapseOutlinePanel
          ? document.body.classList.remove('no-collapse-outline')
          : document.body.classList.add('no-collapse-outline'),
          (File.option.canCollapseOutlinePanel = canCollapseOutlinePanel),
          this.editor &&
            this.editor.nodeMap &&
            this.editor.nodeMap.toc &&
            this.editor.nodeMap.toc.updateHTML(!0);
      },
      decideLineEnding: function (text) {
        var detectedCRLF = text.indexOf('\r\n') > -1 || (!(text.indexOf('\n') > -1) && null);
        if (null !== detectedCRLF) File.setLineEnding(detectedCRLF);
        else {
          var preferredCRLF = File.editor.localSettingBridge
            ? File.editor.localSettingBridge.preferCRLF()
            : File.option.preferCRLF;
          File.setLineEnding(preferredCRLF);
        }
        var textLength = text.length,
          finalNewline = File.editor.localSettingBridge
            ? File.editor.localSettingBridge.preferFinalNewline()
            : File.option.preferFinalNewline;
        textLength
          ? ((File.finalNewline = '\n' == text.substr(textLength - 1)),
            text.length > 1 && '\n' == text.substr(textLength - 2)
              ? (File.finalNewline = finalNewline)
              : text.length > 1 &&
                '\r' == text.substr(textLength - 2) &&
                (text.length > 2 && text.substr(textLength - 3)
                  ? (File.finalNewline = '\n' == text.substr(textLength - 3))
                  : (File.finalNewline = finalNewline)))
          : (File.finalNewline = finalNewline);
      },
      setDefaultImageStorage: function (defaultImageStorage) {
        (File.option.defaultImageStorage = defaultImageStorage),
          File.editor.imgEdit && (File.editor.imgEdit.cachedFileImageStorage = null);
      },
      exitOversize: function () {
        var element = document.querySelector('#marklyra-oversize-body');
        element &&
          !element.style.display &&
          ((element.style.display = 'none'), console.sendLog('[exitOversize]')),
          (File.bundle.unsupported = !1);
      },
      doEnterOversize: function (fromBroadcast) {
        console.sendLog(`[doEnterOversize] ${fromBroadcast ? 'fromBroadcast' : 'fromSelf'}`),
          (document.querySelector('#marklyra-oversize-body').style.display = ''),
          (File.bundle.unsupported = File.UNSUPPORTED_REASON.OVERSIZE),
          File.isNode && !fromBroadcast && JSBridge.invoke('document.addSnap', null);
      },
      tryEnterOversize: function (sourceText, forceOversize, fromBroadcast) {
        return File.isMac && !File.bundle.filePath
          ? (File.exitOversize(), sourceText)
          : (fileIntegration.bindOversizePlaceholder(),
            forceOversize || sourceText.length > File.MAX_FILE_SIZE
              ? (File.doEnterOversize(fromBroadcast), '')
              : (File.exitOversize(), sourceText));
      },
      recoverPosOrScroll: function (savedPosition) {
        console.debug('File.bundle.filePath', File.bundle.filePath);
        var cachedPosition = File.editor.library.cursorBackups[File.bundle.filePath || ''];
        savedPosition &&
        ((savedPosition.cursorPos && 'null' !== savedPosition.cursorPos) ||
          savedPosition.scrollOffset) &&
        (!cachedPosition || cachedPosition.date < savedPosition.timeStamp)
          ? (!savedPosition.cursorPos ||
              'null' === savedPosition.cursorPos ||
              ('INPUT' === document.activeElement.tagName &&
                document.activeElement.closest('#sidebar-content')) ||
              (File.editor.undo.exeCommand(JSON.parse(savedPosition.cursorPos)),
              File.editor.selection.scrollAdjust()),
            void 0 != savedPosition.scrollOffset &&
              (console.debug('recoverPosOrScroll', savedPosition.scrollOffset),
              jquery('content').scrollTop(savedPosition.scrollOffset)))
          : cachedPosition
            ? (console.debug('recoverPosOrScroll', cachedPosition),
              cachedPosition.type
                ? (File.editor.undo.exeCommand(cachedPosition),
                  File.editor.selection.scrollAdjust())
                : window.getSelection().removeAllRanges(),
              void 0 != cachedPosition.scrollOffset &&
                jquery('content').scrollTop(cachedPosition.scrollOffset))
            : window._hasSwitchCallback ||
              isInputComponent(document.activeElement) ||
              (window.getSelection().removeAllRanges(),
              File.editor.writingArea.focus(),
              jquery('content').scrollTop(0));
      },
      getFileName: function (useSuggestedName) {
        if (File.isMac) {
          var filePath = File.bundle.filePath,
            currentFolderPath = File.bundle.currentFolderPath,
            relativeFileName = void 0;
          return (
            filePath &&
              currentFolderPath &&
              (relativeFileName = filePath.replace(currentFolderPath, '').replace(/^\//g, '')),
            relativeFileName || (useSuggestedName ? File.getSuggestedFileName() : void 0)
          );
        }
        return File.bundle.fileName
          ? File.bundle.fileName
          : File.bundle.filePath
            ? ((File.bundle.fileName = fileIntegration.getFileNameFromPath(File.bundle.filePath)),
              File.bundle.fileName)
            : useSuggestedName
              ? File.getSuggestedFileName()
              : void 0;
      },
      getSuggestedFileName: function (preferCurrentName) {
        if (File.bundle.fileName) return File.bundle.fileName.replace(/\.[^.]+$/, '');
        if (preferCurrentName) {
          var text = File.getFileName();
          if (text) return text.replace(/\.[^.]+$/, '');
        }
        var headingElement,
          metadataNode,
          currentText = '',
          datePrefix = '';
        try {
          (metadataNode = File.editor.docMenu.getMetaNode()) &&
            ((datePrefix = File.editor.docMenu.getValueInMeta('date', metadataNode) || ''),
            (datePrefix = (/\d+-\d+-\d+/g.exec(datePrefix) ||
              /\d+\/\d+\/\d+/g.exec(datePrefix) || [''])[0]),
            (currentText = (currentText =
              File.editor.docMenu.getValueInMeta('title', metadataNode) || '')
              .replace(/(^\s*("|'))|(("|')\s*)/gi, '')
              .replace(/\s+(.)/gi, '-$1')
              .toLocaleString()),
            (currentText =
              datePrefix && currentText ? [datePrefix, currentText].join('-') : currentText)),
            (0 != currentText.trim().length && '-' != currentText) ||
              ((headingElement = jquery(
                jquery(
                  "[mdlike='h1'], [mdlike='h2'], [mdlike='h3'], #write h1, #write h2, #write h3",
                )[0],
              )),
              File.editor.sourceView.inSourceMode
                ? (currentText =
                    (currentText = File.editor.getMarkdown()).substring(
                      0,
                      currentText.indexOf('\n'),
                    ) || currentText).length > 60 &&
                  (currentText = currentText.substring(0, currentText.indexOf('.')) || currentText)
                : headingElement.length
                  ? (currentText = File.editor.UserOp.getDisplayText(headingElement).replace(
                      /\r?\n/gi,
                      '',
                    ))
                  : (currentText =
                      (currentText = (headingElement = jquery(
                        jquery('[cid]:not(.md-meta-block)')[0],
                      )).length
                        ? File.editor.UserOp.getDisplayText(headingElement)
                        : '').substring(0, currentText.indexOf('\n')) || currentText).length > 60 &&
                    (currentText =
                      currentText.substring(0, currentText.indexOf('.')) || currentText)),
            currentText.length > 120 && (currentText = currentText.substring(0, 120));
        } catch (error) {}
        return (
          0 == currentText.trim().length &&
            (currentText = jquery.localize.getString('Untitled', 'Front')),
          utilities.removeInvalidPathCh(currentText.trim()) || 'Untitled'
        );
      },
    };
    moduleRecord.exports = fileOptions;
  },
);
