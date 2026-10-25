// document/project-settings.
// SystemJS module 4a. Dependencies: 33, 11.
$__System.registerDynamic(
  '4a',
  ['33', '11'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    this || self;
    var fileIntegration = requireModule('33'),
      utilities = requireModule('11');
    const items = ['marklyra-root-url', 'marklyra-copy-images-to'],
      currentItems = [
        'title',
        'author',
        'defaultCodeLang',
        'end-of-line',
        'papersize',
        'margin',
        'margin-left',
        'margin-right',
        'margin-top',
        'margin-bottom',
        'append-head',
        'append-body',
      ].concat(items);
    var s = function (editor) {
      (this.editor = editor),
        (this.levels = []),
        (this.fileSetting = {}),
        (this.projectSetting = {}),
        (this.isLoadingProjectSetting = !1),
        (this.prevFilePath = null),
        File.bundle.path && this.loadFromProject();
    };
    function l(readSetting) {
      var normalizedSettings = {};
      function n(text) {
        var settingValue = readSetting(text);
        if (!settingValue) {
          var alternateKey = text.replace(/-/g, '_');
          return readSetting(alternateKey);
        }
        return settingValue;
      }
      return (
        currentItems.map((text) => {
          var settingValue = n(text);
          !settingValue &&
            /^marklyra/.exec(text) &&
            (settingValue = n(text.replace(/^marklyra[-_]/, ''))),
            settingValue && (normalizedSettings[text] = settingValue);
        }),
        normalizedSettings
      );
    }
    (s.prototype.preferCRLF = function () {
      var text = this.getSetting('end-of-line') || '';
      return text.length ? 'crlf' == text.toLowerCase() : File.option.preferCRLF;
    }),
      (s.prototype.preferFinalNewline = function () {
        var text = this.getSetting('prefer-final-newline') || '';
        return 'true' == text.toLowerCase()
          ? 1
          : 'false' == text.toLowerCase()
            ? -1
            : File.option.preferFinalNewline;
      }),
      (s.prototype.getCalculatedSetting = function () {
        return Object.assign({}, this.projectSetting, this.fileSetting);
      }),
      (s.prototype.getSetting = function (text) {
        var settingValue = this.projectSetting[text] || this.projectSetting[text.toLowerCase()];
        return (
          ('unset' !== settingValue && void 0 !== settingValue) ||
            (settingValue = this.fileSetting[text] || this.fileSetting[text.toLowerCase()]),
          'unset' === settingValue || void 0 === settingValue ? File.option[text] : settingValue
        );
      });
    var metadataFields = ['title', 'author', 'subject', 'creator', 'split-level', 'toc-depth'],
      htmlExportFields = [
        'header',
        'footer',
        'sidebar',
        'append-head',
        'append-head-extra',
        'append-body',
        'append-body-extra',
      ].concat(metadataFields);
    s.prototype.loadExportOption = function (exportOptions) {
      var fileOverrides = {};
      (exportOptions.allowPerFileSetting ? htmlExportFields : metadataFields).forEach((item) => {
        var settingValue =
          this.getSetting('marklyra-' + item) ||
          this.getSetting(item) ||
          this.getSetting(utilities.capitalize(item));
        void 0 !== settingValue && (fileOverrides[utilities.camelize(item)] = settingValue);
      }),
        'true' === fileOverrides.sidebar && (fileOverrides.sidebar = !0),
        'false' === fileOverrides.sidebar && (fileOverrides.sidebar = !1),
        ('pdf' != exportOptions.type && 'epub' != exportOptions.type) ||
          (fileOverrides.appendHead && (fileOverrides.userAppendHead = !0),
          fileOverrides.appendBody && (fileOverrides.userAppendBody = !0),
          delete fileOverrides.appendHead,
          delete fileOverrides.appendBody,
          delete fileOverrides.appendHeadExtra,
          delete fileOverrides.appendBodyExtra);
      var mergedOptions = Object.assign({}, exportOptions, fileOverrides);
      return (
        Object.keys(mergedOptions).map((item) => {
          mergedOptions[item] = 'unset' == mergedOptions[item] ? '' : mergedOptions[item];
        }),
        mergedOptions
      );
    };
    var timerId = null;
    (s.prototype.cacheSetting = async function () {
      (this.projectSetting = await this.getCalculatedProjectSetting()),
        timerId && clearTimeout(timerId),
        (timerId = setTimeout(() => {
          this.editor.imgEdit.refreshLocalImg();
        }, 100));
    }),
      (s.prototype.loadFromFile = function () {
        var fileSetting = this.editor.docMenu.buildMetaMap();
        return (this.fileSetting = fileSetting), this.fileSetting;
      }),
      (s.prototype.loadFromProject = async function (unusedParameter1) {}),
      (s.prototype.getCalculatedProjectSetting = async function () {
        const e = () => {
          var mergedSettings = {};
          for (record of this.levels) Object.assign(mergedSettings, record[1]);
          return mergedSettings;
        };
        return this.isLoadingProjectSetting
          ? new Promise((resolvePromise) => {
              setTimeout(() => {
                this.isLoadingProjectSetting
                  ? setTimeout(() => {
                      resolvePromise(e());
                    }, 500)
                  : resolvePromise(e());
              }, 100);
            })
          : e();
      }),
      (s.prototype.onFilePathChanged = async function () {
        if ((console.debug('onFilePathChanged'), this.prevFilePath !== File.bundle.filePath)) {
          this.prevFilePath = File.bundle.filePath;
          var levels = [],
            cachedDirectory = null;
          for (record of this.levels) {
            if (!File.bundle.filePath.startsWith(record[0])) break;
            (cachedDirectory = record[0]), levels.push(record);
          }
          (this.levels = levels), await this.loadFromProject(cachedDirectory);
        }
      }),
      (s.prototype.searchProjectConfigByNode = async function (stopDirectory) {
        stopDirectory || ((this.levels = []), (stopDirectory = ''));
        const pathUtilities = reqnode('path'),
          fileSystemExtra = reqnode('fs-extra');
        var startDirectory = fileIntegration.getCurrentFileFolderPath() || File.getMountFolder();
        if (!startDirectory) return;
        const s = async (directoryPath) => {
            try {
              var configText = await fileSystemExtra.readFile(
                directoryPath + '/.editorConfig',
                'utf8',
              );
              if (!configText) return;
              var localItems = this.parseFromString(configText),
                editorConfig = {};
              return (
                localItems.map((item) => {
                  item[0] || (editorConfig.notRoot = 'true' !== item[1].root),
                    (item[0] && 'marklyra' !== item[0]) ||
                      (editorConfig = Object.assign(
                        editorConfig,
                        l((settingKey) => item[1][settingKey]),
                      ));
                }),
                editorConfig
              );
            } catch (error) {
              console.debug(error);
            }
            return null;
          },
          c = async (directoryPath) => {
            try {
              var configText = await fileSystemExtra.readFile(
                directoryPath + '/.marklyraConfig',
                'utf8',
              );
              if (!configText) return;
              var sectionValues = this.parseFromString(configText)[0][1];
              return l((settingKey) => sectionValues[settingKey]);
            } catch (error) {}
            return null;
          };
        for (
          var reachedEditorConfigRoot = !1,
            foundProjectConfig = !1,
            currentDirectory = (startDirectory = pathUtilities.normalize(startDirectory)),
            discoveredLevels = [];
          currentDirectory.length > 1 &&
          stopDirectory != currentDirectory &&
          ((this.isLoadingProjectSetting = !0), !reachedEditorConfigRoot || !foundProjectConfig);
        ) {
          var [editorConfig, projectConfig] = await Promise.all([
            reachedEditorConfigRoot ? Promise.resolve(null) : s(currentDirectory),
            foundProjectConfig ? Promise.resolve(null) : c(currentDirectory),
          ]);
          (reachedEditorConfigRoot = reachedEditorConfigRoot || !(editorConfig || {}).notRoot),
            (foundProjectConfig = !!projectConfig);
          var mergedConfig = null;
          (mergedConfig =
            editorConfig && projectConfig
              ? Object.assign(editorConfig, projectConfig)
              : projectConfig || editorConfig) &&
            (items.map((item) => {
              var relativeSettingPath = mergedConfig[item];
              relativeSettingPath &&
                (mergedConfig[item] = utilities.getAbsolutePath(
                  currentDirectory,
                  relativeSettingPath,
                ));
            }),
            discoveredLevels.push([currentDirectory, mergedConfig])),
            (currentDirectory = utilities.pathByDeleteLastComponent(currentDirectory));
        }
        (this.levels = this.levels.concat(discoveredLevels.reverse())),
          this.cacheSetting(),
          console.debug('searchProjectConfigByNode', this.levels);
      });
    var iniPatterns = {
      section: /^\s*\[(([^#;]|\\#|\\;)+)\]\s*([#;].*)?$/,
      param: /^\s*([\w\.\-\_]+)\s*[=:]\s*(.*?)\s*([#;].*)?$/,
      comment: /^\s*[!#;].*$/,
      eatNextLine: /\\\s*$/,
    };
    (s.prototype.parseFromString = function (text) {
      var sectionValues = {},
        sectionName = null,
        localItems = [[sectionName, sectionValues]];
      function r(inputText) {
        return inputText.replace(/\\([\s\\])/g, '$1').replace(/^[ \t]|[ \t]$/g, '');
      }
      var continuationKey = !1;
      return (
        text.split(/\r\n|\r|\n/).forEach(function (item) {
          var match;
          continuationKey
            ? ((sectionValues[continuationKey] += r(item)),
              (continuationKey = !!iniPatterns.eatNextLine.exec(item) && continuationKey))
            : iniPatterns.comment.test(item) ||
              (iniPatterns.param.test(item)
                ? ((match = item.match(iniPatterns.param)),
                  (sectionValues[match[1]] = r(match[2])),
                  !match[3] &&
                    iniPatterns.eatNextLine.exec(match[2]) &&
                    (continuationKey = match[1]))
                : iniPatterns.section.test(item) &&
                  ((match = item.match(iniPatterns.section)),
                  (sectionName = match[1].toLowerCase()),
                  (sectionValues = {}),
                  localItems.push([sectionName, sectionValues])));
        }),
        localItems
      );
    }),
      (s.prototype.show = async function () {
        File.editor.library.tmpHideSidebar(!0);
        var element = document.querySelector('#marklyra-local-setting');
        element
          ? element.contentWindow.postMessage(
              {
                type: 'reload',
                initData: {
                  workspaceSetting: await this.getCalculatedProjectSetting(),
                  fileSetting: this.fileSetting,
                },
              },
              '*',
            )
          : (element = this.initFrame()),
          document.body.classList.add('marklyra-show-local-setting');
      }),
      (s.prototype.close = function () {
        File.editor.library.recoverSidebar(),
          document.body.classList.remove('marklyra-show-local-setting');
      }),
      (s.prototype.initFrame = function () {
        var IFRAMEElement = document.createElement('IFRAME');
        return (
          IFRAMEElement.setAttribute('id', 'marklyra-local-setting'),
          IFRAMEElement.setAttribute('src', 'http://localhost:3000/local-setting.html?os=win'),
          document.body.appendChild(IFRAMEElement),
          window.addEventListener(
            'message',
            async (messageEvent) => {
              if (messageEvent.source !== IFRAMEElement.contentWindow) return;
              var { type: messageType, _callbackID: current_callbackID } = messageEvent.data;
              const r = (callbackResult) => {
                if (current_callbackID) {
                  callbackResult = callbackResult || {};
                  var callbackMessage = Object.assign({}, callbackResult, {
                    _callbackID: current_callbackID,
                    type: 'callback',
                  });
                  IFRAMEElement.contentWindow.postMessage(callbackMessage, '*');
                }
                current_callbackID = null;
              };
              'closeLocalSetting' == messageType
                ? this.close()
                : 'fetchLocalSetting' == messageType &&
                  r({
                    userLocale: File.option.userLocale,
                    workspaceSetting: await this.getCalculatedProjectSetting(),
                    fileSetting: this.fileSetting,
                  }),
                r();
            },
            !1,
          ),
          IFRAMEElement
        );
      }),
      (moduleRecord.exports = s);
  },
);
