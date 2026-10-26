// ui/spelling.
export default function initializeUiSpelling(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  requireModule('host/environment');
  var jquery = requireModule('libraries/jquery'),
    fileIntegration = requireModule('host/file-integration'),
    map = requireModule('editing/keyboard-shortcuts').map,
    items = [
      { code: 'en-US', userLang: 'en-US', label: 'English (US)', enLabel: 'English (US)' },
      { code: 'en-GB', userLang: 'en-GB', label: 'English (UK)', enLabel: 'English (UK)' },
      { code: 'id', userLang: 'id-ID', label: 'Bahasa Indonesia', enLabel: 'Indonesian' },
      { code: 'nb', userLang: 'nb-NO', label: 'Bokmål', enLabel: 'Norwegian' },
      { code: 'cs', userLang: 'cs-CZ', label: 'Čeština', enLabel: 'Czech' },
      { code: 'ca', userLang: 'ca-ES', label: 'Català', enLabel: 'Catalan' },
      { code: 'da', userLang: 'da-DK', label: 'Dansk', enLabel: 'Danish' },
      { code: 'de', userLang: 'de-DE', label: 'Deutsch', enLabel: 'German' },
      { code: 'de-CH', userLang: 'de-CH', label: 'Schweizerdeutsch', enLabel: 'Swiss German' },
      { code: 'es', userLang: 'es-ES', label: 'Español', enLabel: 'Spanish' },
      { code: 'el', userLang: 'el-GR', label: 'Ελληνικά', enLabel: 'Greek' },
      { code: 'fr', userLang: 'fr-FR', label: 'Français', enLabel: 'French' },
      { code: 'gl', userLang: 'gl-ES', label: 'Galego', enLabel: 'Galician' },
      { code: 'hr', userLang: 'hr-HR', label: 'Hrvatski', enLabel: 'Croatian' },
      { code: 'it', userLang: 'it-IT', label: 'Italiano', enLabel: 'Italian' },
      { code: 'ro', userLang: 'ro-RO', label: 'Limba Română', enLabel: 'Romanian' },
      { code: 'nl', userLang: 'nl-NL', label: 'Nederlands', enLabel: 'Dutch' },
      { code: 'nn', userLang: 'nn-NO', label: 'Nynorsk', enLabel: 'Norwegian Nynorsk' },
      { code: 'hu', userLang: 'hu-HU', label: 'Magyar', enLabel: 'Hungarian' },
      { code: 'ms', userLang: 'ms-MY', label: 'Orang Melayu', enLabel: 'Malay' },
      { code: 'pl', userLang: 'pl-PL', label: 'Polski', enLabel: 'Polish' },
      {
        code: 'pt-BR',
        userLang: 'pt-BR',
        label: 'Português (Brasil)',
        enLabel: 'Portuguese (Brazil)',
      },
      {
        code: 'pt',
        userLang: 'pt-PT',
        label: 'Português (Portugal)',
        enLabel: 'Portuguese (Portugal)',
      },
      { code: 'ru', userLang: 'ru-RU', label: 'Ру́сский', enLabel: 'Russian' },
      { code: 'sk', userLang: 'sk-SK', label: 'Slovenčina', enLabel: 'Slovak' },
      { code: 'sl', userLang: 'sl-SI', label: 'Slovenščina', enLabel: 'Slovenian' },
      { code: 'sv', userLang: 'sv-SE', label: 'Svenska', enLabel: 'Swedish' },
      { code: 'vi', userLang: 'vi-VN', label: 'Tiếng Việt', enLabel: 'Vietnamese' },
      { code: 'tr', userLang: 'tr-TR', label: 'Türkçe', enLabel: 'Turkish' },
      { code: 'uk', userLang: 'uk-UA', label: 'Українська мова', enLabel: 'Ukrainian' },
      { code: 'fa', userLang: 'fa-IR', label: 'فارسی', enLabel: 'Persian' },
      { code: 'ar', userLang: 'ar-SA', label: 'العربية', enLabel: 'Arabic' },
      { code: 'he', userLang: 'he-IL', label: 'עִבְרִית', enLabel: 'Hebrew' },
      { code: 'ko', userLang: 'jo-KR', label: '한국어', enLabel: 'Korean' },
      { code: 'zh', userLang: 'zh', label: '中文', enLabel: 'Chinese' },
      { code: 'ja', userLang: 'ja-JP', label: '日本語', enLabel: 'Japanese' },
    ],
    currentLangMode_ = 'auto',
    SpellingController = function (editor) {
      this.editor = editor;
      this.perFileSettingCache_ = new Map();
      this.langMode_ = File.option.presetSpellCheck;
      this.missingLocale_;
      this.clear_();
      var receiver = this;
      if (window.requestIdleCallback) {
        requestIdleCallback(function () {
          receiver.init_();
          receiver.reset();
        });
      } else {
        setTimeout(function () {
          receiver.init_();
          receiver.reset();
        }, 100);
      }
    };
  SpellingController.prototype.useHunSpell = function () {
    return !/Windows NT (8|10)\./.exec(navigator.userAgent);
  };
  SpellingController.prototype.loadEnvLang_ = function () {
    var currentMap = new Map();
    this.labelMap = {};
    items.forEach(function (item) {
      currentMap.set(item.userLang, item.code);
      this.labelMap[item.code] = item.label;
    }, this);
    var userLocale = File.option.userLocale,
      envLang_ = currentMap.get(userLocale);
    if (!envLang_) {
      envLang_ = /^zh/.exec(userLocale)
        ? 'zh'
        : currentMap.get(File.option.appLocale || 'en-US') || 'en-US';
    }
    this.envLang_ = envLang_;
  };
  SpellingController.prototype.loadSettingForFile_ = function () {
    if (this.spellCheckFactory) {
      if (File.bundle.filePath) {
        if (this.perFileSettingCache_.has(File.bundle.filePath)) {
          this.langMode_ =
            this.perFileSettingCache_.get(File.bundle.filePath) || File.option.presetSpellCheck;
        } else {
          this.langMode_ = fileIntegration.getItemInDB('[spellcheck]' + File.bundle.filePath);
          this.perFileSettingCache_.set(File.bundle.filePath, this.langMode_);
          this.langMode_ = this.langMode_ || File.option.presetSpellCheck;
        }
      } else {
        this.langMode_ = File.option.presetSpellCheck;
      }
      var receiver = this;
      if (this.langMode_ != currentLangMode_ && 'disabled' != this.langMode_ && File.isNode) {
        setTimeout(async function () {
          receiver.curSpellchecker = await receiver.getSpellChecker(receiver.langMode_, true);
        }, 1e3);
      }
    }
  };
  SpellingController.prototype.init_ = function () {
    if (File.isNodeHtml) {
      this.$label = document.querySelector('#footer-spell-check');
      this.bindUI_();
      if (File.isNode) {
        this.detectTimer_ = null;
        this.loadEnvLang_();
        this.bindSpellChecker_();
      }
    }
  };
  SpellingController.prototype.bindUI_ = function () {
    var receiver = this;
    jquery('#footer-spell-check').on('click', function () {
      if (document.body.classList.contains('marklyra-show-spell-check')) {
        receiver.hide();
      } else {
        receiver.show();
      }
    });
    jquery('#spell-check-panel')
      .on('click', '[data-spell-lang]', function () {
        receiver.setLangMode(this.dataset.spellLang, true);
        receiver.hide();
        if (
          document
            .querySelector('#footer-spell-check')
            .classList.contains('marklyra-spell-check-dict-error')
        ) {
          receiver.showDictMissing();
        }
      })
      .on('click', '#marklyra-spell-check-global-setting', function () {
        receiver.hide();
        File.megaMenu.highlight('spellcheck-option-wrapper');
      });
    const supportDomain = File.option.useMirrorInCN ? 'marklyra.com.cn' : 'marklyra.io';
    jquery('#md-notification')
      .on('click', '.dropdown-toggle', function () {
        if (jquery('#md-notification .dropdown-menu:visible').length) {
          jquery('#md-notification .dropdown-menu').parent().removeClass('open');
        } else {
          jquery('#md-notification .dropdown-menu').dropdown('toggle');
        }
      })
      .on('blur', '.dropdown-toggle', function () {
        jquery('#md-notification .dropdown-menu').parent().removeClass('open');
      })
      .on('shown.bs.dropdown', function (unusedParameter1) {
        var dropdown = jquery(this),
          elements = dropdown.find('.dropdown-toggle-split'),
          currentElements = dropdown.find('.dropdown-menu'),
          offset = elements.offset();
        offset.top += elements[0].clientHeight + 4;
        offset.left += elements[0].clientWidth - currentElements[0].clientWidth + 2;
        currentElements.offset(offset);
      })
      .on('click', '#marklyra-spell-check-dict-missing-disable-btn', function () {
        receiver.setLangMode('disabled', true);
        document.body.classList.remove('marklyra-show-notification');
      })
      .on('click', '#marklyra-spell-check-dict-missing-close-btn', function () {
        document.body.classList.remove('marklyra-show-notification');
      })
      .on('click', '#marklyra-spell-check-dict-missing-primary-btn', function () {
        if (receiver.useHunSpell()) {
          receiver.askDownloadDict_();
        } else {
          JSBridge.showInBrowser(`https://support.${supportDomain}/Spellcheck/`);
        }
      })
      .on('mousedown', '#marklyra-spell-check-dict-missing-secondary-btn', function () {
        if (receiver.useHunSpell()) {
          JSBridge.showInBrowser(`https://support.${supportDomain}/Spellcheck/`);
        } else {
          receiver.askDownloadDict_();
        }
      });
    jquery('#dict-install-dialog').on('click', '.btn-primary', function () {
      receiver.doDownloadDict_();
    });
  };
  SpellingController.prototype.postSetSpellChecker_ = function (language, showMissingDictionary) {
    try {
      this.resetSpellCheckProvider_();
    } catch (error) {
      console.sendError(error);
    }
    var spellcheckHint;
    if (this.userDictPath) {
      if (null == this.curSpellchecker && this.downloadDicts[language] <= 1) {
        jquery('#footer-spell-check')
          .attr(
            'marklyra-hint',
            jquery.localize
              .getString('Spell Check (%@ downloading)')
              .replace('%@', this.labelMap[language]),
          )
          .removeClass('marklyra-spell-check-dict-error')
          .addClass('marklyra-spell-check-dict-downloading');
      } else {
        jquery('#footer-spell-check').removeClass('marklyra-spell-check-dict-downloading');
        if (null == this.curSpellchecker && showMissingDictionary) {
          jquery('#footer-spell-check')
            .attr(
              'marklyra-hint',
              jquery.localize
                .getString('Spell Check (%@ unavailable)')
                .replace('%@', this.labelMap[language]),
            )
            .addClass('marklyra-spell-check-dict-error');
          if (!(this.langMode_ == currentLangMode_ && language && /^(zh|ja|hi)/.exec(language))) {
            this.showDictMissing();
          }
        } else {
          spellcheckHint = this.labelMap[language]
            ? (jquery.localize.getString('Spell Check') + ' (%@)').replace(
                '%@',
                this.labelMap[language],
              )
            : 'disabled' == this.langMode_
              ? jquery.localize.getString('Spell Check (Disabled)')
              : jquery.localize.getString('Spell Check');
          jquery('#footer-spell-check')
            .attr('marklyra-hint', spellcheckHint)
            .removeClass('marklyra-spell-check-dict-error');
          if (jquery('#marklyra-spell-check-dict-missing-close-btn').length) {
            document.body.classList.remove('marklyra-show-notification');
          }
        }
      }
    }
  };
  SpellingController.prototype.setLangMode = async function (langMode_, filePath) {
    if (!this.spellCheckFactory) {
      langMode_ = 'disabled';
      filePath = false;
    }
    this.langMode_ = langMode_;
    if (File.bundle.filePath && filePath) {
      fileIntegration.setItemInDB('[spellcheck]' + File.bundle.filePath, langMode_);
      this.perFileSettingCache_.set(File.bundle.filePath, this.langMode_);
    }
    var langAuto_,
      curSpellchecker = this.curSpellchecker,
      dictionaryRequested = false;
    if ('disabled' == this.langMode_) {
      this.curSpellchecker = null;
    } else {
      if (this.langMode_ == currentLangMode_) {
        if (this.langAuto_) {
          langAuto_ = this.langAuto_;
          this.curSpellchecker = await this.getSpellChecker(this.langAuto_, true);
          dictionaryRequested = true;
        } else {
          this.curSpellchecker = null;
          this.spellCheckFactory.clearCache();
          this.scheduleAutoUpdateLang();
        }
      } else {
        langAuto_ = this.langMode_;
        this.curSpellchecker = await this.getSpellChecker(this.langMode_, true);
        dictionaryRequested = true;
      }
    }
    this.postSetSpellChecker_(langAuto_, dictionaryRequested);
    if (
      curSpellchecker &&
      curSpellchecker != this.curSpellchecker &&
      (curSpellchecker || {}).lang != (this.curSpellchecker || {}).lang
    ) {
      jquery("[contenteditable='true']")
        .prop('contenteditable', false)
        .prop('contenteditable', true);
    }
    this.updatePanel();
  };
  SpellingController.prototype.buildPanel_ = function () {
    if (!this.panelBuilt_) {
      this.$panel = jquery('#spell-check-panel');
      this.renderLangCandidate_(items);
      var receiver = this;
      this.panelBuilt_ = true;
      var timerId = null;
      jquery('#marklyra-spell-check-panel-item-label')
        .on('keydown', function (keyboardEvent) {
          keyboardEvent.stopPropagation();
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Esc' == map[keyCode]) {
            receiver.hide();
          } else {
            if ('Tab' == map[keyCode]) {
              return false;
            }
            if ('Up' == map[keyCode] || 'Down' == map[keyCode]) {
              receiver.selectMove_('Up' == map[keyCode]);
              return false;
            }
            if ('Enter' == map[keyCode]) {
              jquery('[data-spell-lang].marklyra-active').trigger('click');
            } else {
              if (!('Backspace' != map[keyCode] && 'Delete' != map[keyCode])) {
                jquery(this).trigger('input');
              }
            }
          }
        })
        .on('input cut copy', function (unusedParameter1) {
          if (timerId) {
            clearTimeout(timerId);
          }
          timerId = setTimeout(function () {
            receiver.updateLangCandicate_();
            timerId = null;
          }, 50);
        });
      this.updatePanel();
    }
  };
  SpellingController.prototype.renderLangCandidate_ = function (inputItems) {
    var element = this.$panel[0].querySelector('.marklyra-lang-list'),
      trimmedText = this.$panel[0]
        .querySelector('#marklyra-spell-check-panel-item-temp')
        .innerText.trim(),
      langMode_ = this.langMode_,
      html = inputItems
        .map(function (item) {
          return trimmedText
            .replace('%label', item.label)
            .replace(/%code/g, item.code)
            .replace(/%select/, langMode_ == item.code ? 'marklyra-checked' : '');
        })
        .join('');
    element.innerHTML = html;
  };
  SpellingController.prototype.updateLangCandicate_ = function () {
    var searchValue = jquery('#marklyra-spell-check-panel-item-label')
      .val()
      .trim()
      .toLocaleLowerCase();
    if (!searchValue) {
      this.renderLangCandidate_(items);
      return void this.ensureHighlight_();
    }
    if (!this.$panel[0].style.height) {
      var panelElement = this.$panel[0];
      panelElement.style.height = panelElement.clientHeight + 'px';
    }
    var matchRanks = {},
      filteredItems = items.filter(function (item) {
        var matchRank = [item.code, item.userLang, item.label, item.enLabel]
          .map(function (inputItem) {
            var matchOffset = inputItem.toLocaleLowerCase().indexOf(searchValue);
            if (~matchOffset) {
              return matchOffset;
            } else {
              return 99;
            }
          })
          .sort()[0];
        return 99 != matchRank && ((matchRanks[item.code] = matchRank), true);
      });
    filteredItems = filteredItems.sort(function (leftLocale, rightLocale) {
      return matchRanks[leftLocale.code] - matchRanks[rightLocale.code];
    });
    this.renderLangCandidate_(filteredItems);
    this.ensureHighlight_();
  };
  SpellingController.prototype.ensureHighlight_ = function () {
    var elements = this.$panel.find('.marklyra-active');
    if (!elements.length) {
      elements = this.$panel
        .find('.marklyra-lang-list>.marklyra-spell-check-panel-item')
        .first()
        .addClass('marklyra-active');
    }
    return elements;
  };
  SpellingController.prototype.selectMove_ = function (moveUp) {
    var element = this.ensureHighlight_(),
      currentElement = moveUp ? element.prev() : element.next();
    element.removeClass('marklyra-active');
    currentElement.addClass('marklyra-active');
  };
  SpellingController.prototype.getSpellCheckLang_ = function () {
    if ('disabled' == this.langMode_) {
      return null;
    } else {
      if (this.langMode_ == currentLangMode_) {
        return this.langAuto_ || '';
      } else {
        return this.langMode_;
      }
    }
  };
  SpellingController.prototype.updatePanel = function () {
    var language = this.getSpellCheckLang_();
    jquery('#footer-spell-check-label').html(
      (language || '').toUpperCase() ||
        '<span class="marklyra-icon marklyra-spellcheck" style="font-size: 1.1em;vertical-align: middle;"></span>',
    );
    if (this.panelBuilt_) {
      this.$panel.find('.marklyra-checked').removeClass('marklyra-checked');
      this.$panel.find("[data-spell-lang='" + this.langMode_ + "']").addClass('marklyra-checked');
      this.$panel
        .find("[data-spell-lang='auto'] .marklyra-spell-check-panel-item-code")
        .text(this.langAuto_ || '');
    }
  };
  SpellingController.prototype.show = function () {
    if (this.loadSpellCheckErr) {
      this.showLoadModuleError_();
    }
    this.editor.lastCursor = this.editor.selection.buildUndo();
    this.buildPanel_();
    document.body.classList.add('marklyra-show-spell-check');
    document.body.classList.remove('marklyra-show-word-count');
    this.autoUpdateLang(true);
    setTimeout(function () {
      document.querySelector('#marklyra-spell-check-panel-item-label').focus();
    }, 10);
    this.$panel[0].style.height = '';
  };
  SpellingController.prototype.hide = function () {
    document.body.classList.remove('marklyra-show-spell-check');
    this.editor.restoreLastCursor();
    jquery('#marklyra-spell-check-panel-item-label').val('');
    this.$panel.find('.marklyra-active').removeClass('marklyra-active');
    this.$panel[0].style.height = '';
    this.renderLangCandidate_(items);
  };
  SpellingController.prototype.askDownloadDict_ = function () {
    var installDialog = jquery('#dict-install-dialog'),
      missingLocale_ = this.missingLocale_;
    installDialog
      .find('#dict-install-dialog-title')
      .text(
        jquery.localize
          .getString('Download dictionary file for %@')
          .replace('%@', missingLocale_.label),
      );
    var licenseUrl = 'https://github.com/Refinex-Space/marklyra' + missingLocale_.code + '/LICENSE';
    installDialog.modal({ backdrop: 'static' }).focus();
    setTimeout(function () {
      var licenseWebview = installDialog.find('webview').attr('src', licenseUrl);
      if (File.colorBrightness < 0.5 && licenseWebview.length) {
        licenseWebview[0].addEventListener('did-stop-loading', () => {
          if (File.colorBrightness < 0.5) {
            licenseWebview[0].insertCSS('body{color:white}');
          }
        });
      }
    }, 100);
  };
  SpellingController.prototype.onFinishDownloadProgress_ = function (language) {
    if (this.getSpellCheckLang_() == language) {
      this.downloadDicts[language] = void 0;
      this.spellCheckFactory.clearCache();
      jquery('#footer-spell-check').addClass('marklyra-spell-check-dict-downloaded');
      this.setLangMode(language);
      setTimeout(function () {
        jquery('#footer-spell-check').removeClass('marklyra-spell-check-dict-downloaded');
      }, 1e3);
    }
  };
  SpellingController.prototype.onUpdateDownloadProgress_ = function (
    language,
    dictionaryProgress,
    affixProgress,
  ) {
    var downloadDictsDetail_ = this.downloadDictsDetail_,
      combinedProgress = dictionaryProgress || 0;
    if (dictionaryProgress < 0) {
      downloadDictsDetail_[language] = void 0;
      this.downloadDicts[language] = void 0;
    } else {
      if (!downloadDictsDetail_[language]) {
        downloadDictsDetail_[language] = [0, 0];
      }
      if (void 0 !== dictionaryProgress) {
        downloadDictsDetail_[language][0] = dictionaryProgress;
      }
      if (void 0 !== affixProgress) {
        downloadDictsDetail_[language][1] = affixProgress;
      }
      combinedProgress =
        (downloadDictsDetail_[language][0] + downloadDictsDetail_[language][1]) / 2;
      this.downloadDicts[language] = combinedProgress;
    }
    if (this.getSpellCheckLang_() == language) {
      if (dictionaryProgress < 0) {
        jquery('#footer-spell-check')
          .attr(
            'marklyra-hint',
            jquery.localize
              .getString('Spell Check (%@ unavailable)')
              .replace('%@', this.labelMap[language]),
          )
          .addClass('marklyra-spell-check-dict-error')
          .removeClass('marklyra-spell-check-dict-downloading');
        document.querySelector('#footer-spell-check-download-process').innerText = '';
      } else {
        jquery('#footer-spell-check')
          .attr(
            'marklyra-hint',
            jquery.localize
              .getString('Spell Check (%@ downloading)')
              .replace('%@', this.labelMap[language]),
          )
          .removeClass('marklyra-spell-check-dict-error')
          .addClass('marklyra-spell-check-dict-downloading');
        document.querySelector('#footer-spell-check-download-process').innerText =
          '#footer-spell-check.marklyra-spell-check-dict-downloading:before {width: ' +
          100 * combinedProgress +
          '%;}';
      }
    }
  };
  SpellingController.prototype.doDownloadDict_ = function () {
    var code = this.missingLocale_.code;
    JSBridge.invoke('setting.downloadDict', code);
    this.onUpdateDownloadProgress_(code, 0, 0);
    document.body.classList.remove('marklyra-show-notification');
  };
  SpellingController.prototype.bindSpellChecker_ = function () {
    var receiver = this;
    try {
      var ipcRenderer = reqnode('electron').ipcRenderer;
      ipcRenderer.on('dict-loaded', function (unusedParameter1, userDictPath) {
        receiver.userDictPath = userDictPath;
        receiver.spellCheckFactory.setUserDictionaryPath(receiver.userDictPath);
        if (receiver.langMode_) {
          receiver.setLangMode(receiver.langMode_);
        }
      });
      this.downloadDicts = {};
      this.downloadDictsDetail_ = {};
      ipcRenderer.on('dict-download-start', function (unusedParameter1, language) {
        receiver.onUpdateDownloadProgress_(language, 0, 0);
      });
      ipcRenderer.on('dict-download-process', function (unusedParameter1, progressUpdate) {
        receiver.onUpdateDownloadProgress_(
          progressUpdate.locale,
          'dic' == progressUpdate.type ? progressUpdate.process : void 0,
          'dic' == progressUpdate.type ? void 0 : progressUpdate.process,
        );
      });
      ipcRenderer.on('dict-download-end', function (unusedParameter1, language) {
        receiver.onUpdateDownloadProgress_(language, 1, 1);
        receiver.onFinishDownloadProgress_(language);
      });
      ipcRenderer.on('dict-download-err', function (unusedParameter1, language) {
        receiver.onUpdateDownloadProgress_(language, -1);
      });
      this.spellCheckFactory = requireModule('host/spellchecker');
      this.curSpellchecker = null;
      JSBridge.invoke('setting.getDownloadingDicts').then((result) => {
        JSON.parse(result || '[]').forEach(function (item) {
          receiver.onUpdateDownloadProgress_(item, 0, 0);
        });
      });
      JSBridge.invoke('setting.getUserDictionaryPath')
        .then(async (userDictPath) => {
          this.userDictPath = userDictPath;
          console.debug('userDictPath ' + this.userDictPath);
          if (this.userDictPath) {
            this.spellCheckFactory.setUserDictionaryPath(this.userDictPath);
          }
          var userDictionaryProvider = new (reqnode('events').EventEmitter)();
          userDictionaryProvider.add = function (lang, word) {
            word = word.replace(/[’]/g, "'");
            ipcRenderer.send('user-dict-add', { lang: lang, word: word });
          };
          userDictionaryProvider.remove = function (lang, word) {
            word = word.replace(/[’]/g, "'");
            ipcRenderer.send('user-dict-remove', { lang: lang, word: word });
          };
          var serializedDictionary = await JSBridge.invoke('setting.getUserDict'),
            userDictionary = serializedDictionary ? JSON.parse(serializedDictionary) : {};
          userDictionaryProvider.loadUserDict = function () {
            return userDictionary;
          };
          ipcRenderer.on('user-dict-update', function (unusedParameter1, updatedDictionary) {
            userDictionaryProvider.emit('update', updatedDictionary);
          });
          this.spellCheckFactory.setUserDictProvider(userDictionaryProvider);
          this.resetSpellCheckProvider_();
        })
        .catch((error) => {
          this.loadSpellCheckErr = error.stack || error.message;
          console.error(error);
        });
    } catch (currentError) {
      this.loadSpellCheckErr = currentError.stack || currentError.message;
      console.error(currentError);
    }
    if (!this.spellCheckFactory) {
      jquery('#footer-spell-check')
        .off('click')
        .on('click', function () {
          receiver.showLoadModuleError_();
        });
    }
  };
  SpellingController.prototype.showLoadModuleError_ = function () {
    this.editor.EditHelper.showDialog({
      title: jquery.localize.getString('Failed to load spellcheck module'),
      message: this.loadSpellCheckErr
        .split(/\n/)
        .map(function (text) {
          return text.replace(/\((.+)(TypeMark|app)/, '(');
        })
        .join('\n'),
      type: 'error',
      backdrop: 'static',
    });
  };
  SpellingController.prototype.resetSpellCheckProvider_ = function (unusedParameter1) {
    var receiver = this;
    if ('disabled' != this.langMode_) {
      var providerLanguage = this.getSpellCheckLang_() || this.envLang_ || 'en-US';
      if (/^(zh|ja|hi)/.exec(providerLanguage)) {
        providerLanguage = 'en-US';
      }
      reqnode('electron').webFrame.setSpellCheckProvider(providerLanguage, {
        spellCheck: function (words, reportMisspellings) {
          if (words.length > 1e3) {
            reportMisspellings([]);
          } else {
            window.requestIdleCallback(function () {
              var currentItems = [],
                wordLimit = Math.min(200, words.length),
                curSpellchecker = receiver.curSpellchecker;
              try {
                if (curSpellchecker) {
                  for (
                    var misspellingCount = 0, itemIndex = 0;
                    itemIndex < wordLimit && misspellingCount < 30;
                    itemIndex++
                  ) {
                    var text = words[itemIndex],
                      isMisspelled = curSpellchecker.isMisspelled(text.replace(/[’]/g, "'"));
                    if (isMisspelled && text.indexOf('.') > 0) {
                      isMisspelled = curSpellchecker.isMisspelled(text + '.');
                    }
                    if (isMisspelled) {
                      currentItems.push(words[itemIndex]);
                      misspellingCount++;
                    }
                  }
                } else {
                  receiver.scheduleAutoUpdateLang();
                }
              } catch (error) {}
              reportMisspellings(currentItems);
            });
          }
        },
      });
    } else {
      this.curSpellchecker = null;
    }
  };
  SpellingController.prototype.autoDetectLang_ = function () {
    var editor = this.editor;
    var httpHint = this.getSpellCheckLang_() || this.envLang_;
    if (this.spellCheckFactory) {
      if (this.spellCheckFactory.detectLanguageForText) {
        return this.spellCheckFactory.detectLanguageForText(
          (function () {
            for (
              var elements = editor.writingArea.querySelectorAll('p, h1, h2, h3, h4, h5, h6'),
                paragraphLimit = Math.min(elements.length, 4),
                sampleText = '',
                itemIndex = 0;
              itemIndex < paragraphLimit &&
              ((elements[itemIndex].querySelectorAll("[md-inline='plain']") || []).forEach(
                function (item) {
                  sampleText += item.textContent;
                },
              ),
              !((sampleText += '\n').length > 100));
              itemIndex++
            ) {}
            return sampleText;
          })(),
          { httpHint: httpHint },
        );
      } else {
        return Promise.resolve('', 'detectLanguageForText is not a defined');
      }
    } else {
      return Promise.resolve('');
    }
  };
  var dateInstance = new Date();
  SpellingController.prototype.getSpellChecker = async function (language, retryFailed) {
    language = /^(zh|ja|hi|th)/.exec(language || '') ? 'en-US' : language;
    var spellchecker = this.spellCheckFactory.getSpellChecker(language, retryFailed);
    if (new Date() - dateInstance > 5e4) {
      return spellchecker;
    } else {
      return (
        spellchecker ||
        (await new Promise((resolvePromise) => {
          setTimeout(resolvePromise, 3e3);
        }),
        this.spellCheckFactory.getSpellChecker(language, true))
      );
    }
  };
  SpellingController.prototype.autoUpdateLang = function (forceDetection) {
    if (true === forceDetection || (!this.langAuto_ && 'disabled' != this.langMode_)) {
      var receiver = this;
      this.autoDetectLang_().then(async function (langAuto_, detectionError) {
        if (detectionError) {
          console.sendError(detectionError);
        } else {
          if (langAuto_) {
            if (/^en/.exec(langAuto_)) {
              langAuto_ = /^en/.exec(receiver.envLang_) ? receiver.envLang_ : 'en-US';
            } else {
              if (/^zh/.exec(langAuto_)) {
                langAuto_ = 'zh';
              } else {
                if (!receiver.labelMap[langAuto_]) {
                  langAuto_ = null;
                }
              }
            }
          }
          if (langAuto_) {
            receiver.langAuto_ = langAuto_;
            console.debug('auto detect language: ' + langAuto_);
            receiver.updatePanel();
            if (receiver.langMode_ != currentLangMode_) {
              return;
            }
            receiver.curSpellchecker = await receiver.getSpellChecker(langAuto_, forceDetection);
            receiver.postSetSpellChecker_(langAuto_, true);
          } else {
            if (forceDetection && receiver.langAuto_) {
              receiver.langAuto_ = null;
              receiver.updatePanel();
            }
          }
        }
      });
      this.detectTimer_ = null;
    }
  };
  SpellingController.prototype.scheduleAutoUpdateLang = function (forceDetection) {
    if (this.langMode_ == currentLangMode_ || forceDetection) {
      if (this.detectTimer_) {
        clearTimeout(this.detectTimer_);
      }
      var receiver = this;
      this.detectTimer_ = setTimeout(function () {
        receiver.autoUpdateLang(forceDetection);
      }, 2e3);
    }
  };
  SpellingController.prototype.autoSet_ = function () {
    this.loadSettingForFile_();
    this.autoUpdateLang();
  };
  SpellingController.prototype.clear_ = function () {
    this.langAuto_ = '';
    this.curSpellchecker = null;
    if (this.detectTimer_) {
      clearTimeout(this.detectTimer_);
    }
  };
  SpellingController.prototype.reset = function (detectLanguage) {
    if (File.isNode) {
      this.clear_();
      this.loadSettingForFile_();
      this.setLangMode(this.langMode_);
      if (detectLanguage) {
        this.scheduleAutoUpdateLang(true);
      }
    }
  };
  SpellingController.prototype.showDictMissing = function () {
    var elements = items.find(function (item) {
      return item.code == (this.langMode_ == currentLangMode_ ? this.langAuto_ : this.langMode_);
    }, this);
    if (elements) {
      this.missingLocale_ = elements;
      var innerText = document.querySelector('#marklyra-spell-check-dict-missing-temp').innerText;
      jquery('#md-notification').html(
        innerText
          .replace(
            '$1',
            jquery.localize.getString(
              'Dictionary file is missing to enable spellcheck support for %@.',
            ),
          )
          .replace('%@', elements.label)
          .replace('$2', jquery.localize.getString('Install Language Support'))
          .replace('$3', jquery.localize.getString('Disable Spell Check'))
          .replace('$4', jquery.localize.getString('Dismiss')),
      );
      document.body.classList.add('marklyra-show-notification');
      if (this.useHunSpell()) {
        jquery('#marklyra-spell-check-dict-missing-secondary-btn').text(
          jquery.localize.getString('Learn More…'),
        );
      } else {
        jquery('#marklyra-spell-check-dict-missing-secondary-btn').text(
          jquery.localize.getString('Install dictionary file only for MarkLyra'),
        );
      }
    }
  };
  moduleRecord.exports = SpellingController;
}
