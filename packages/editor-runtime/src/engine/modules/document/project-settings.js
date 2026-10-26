// document/project-settings.
export default function initializeDocumentProjectSettings(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  if (!this) {
    self;
  }
  var fileIntegration = requireModule('host/file-integration'),
    utilities = requireModule('shared/utilities');
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
  var ProjectSettingsBridge = function (editor) {
    this.editor = editor;
    this.levels = [];
    this.fileSetting = {};
    this.projectSetting = {};
    this.isLoadingProjectSetting = false;
    this.prevFilePath = null;
    if (File.bundle.path) {
      this.loadFromProject();
    }
  };
  function normalizeSettings(readSetting) {
    var normalizedSettings = {};
    function readSettingAlias(text) {
      var settingValue = readSetting(text);
      if (!settingValue) {
        var alternateKey = text.replace(/-/g, '_');
        return readSetting(alternateKey);
      }
      return settingValue;
    }
    currentItems.map((text) => {
      var settingValue = readSettingAlias(text);
      if (!settingValue && /^marklyra/.exec(text)) {
        settingValue = readSettingAlias(text.replace(/^marklyra[-_]/, ''));
      }
      if (settingValue) {
        normalizedSettings[text] = settingValue;
      }
    });
    return normalizedSettings;
  }
  ProjectSettingsBridge.prototype.preferCRLF = function () {
    var text = this.getSetting('end-of-line') || '';
    if (text.length) {
      return 'crlf' == text.toLowerCase();
    } else {
      return File.option.preferCRLF;
    }
  };
  ProjectSettingsBridge.prototype.preferFinalNewline = function () {
    var text = this.getSetting('prefer-final-newline') || '';
    if ('true' == text.toLowerCase()) {
      return 1;
    } else {
      if ('false' == text.toLowerCase()) {
        return -1;
      } else {
        return File.option.preferFinalNewline;
      }
    }
  };
  ProjectSettingsBridge.prototype.getCalculatedSetting = function () {
    return Object.assign({}, this.projectSetting, this.fileSetting);
  };
  ProjectSettingsBridge.prototype.getSetting = function (text) {
    var settingValue = this.projectSetting[text] || this.projectSetting[text.toLowerCase()];
    if (!('unset' !== settingValue && void 0 !== settingValue)) {
      settingValue = this.fileSetting[text] || this.fileSetting[text.toLowerCase()];
    }
    if ('unset' === settingValue || void 0 === settingValue) {
      return File.option[text];
    } else {
      return settingValue;
    }
  };
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
  ProjectSettingsBridge.prototype.loadExportOption = function (exportOptions) {
    var fileOverrides = {};
    (exportOptions.allowPerFileSetting ? htmlExportFields : metadataFields).forEach((item) => {
      var settingValue =
        this.getSetting('marklyra-' + item) ||
        this.getSetting(item) ||
        this.getSetting(utilities.capitalize(item));
      if (void 0 !== settingValue) {
        fileOverrides[utilities.camelize(item)] = settingValue;
      }
    });
    if ('true' === fileOverrides.sidebar) {
      fileOverrides.sidebar = true;
    }
    if ('false' === fileOverrides.sidebar) {
      fileOverrides.sidebar = false;
    }
    if (!('pdf' != exportOptions.type && 'epub' != exportOptions.type)) {
      if (fileOverrides.appendHead) {
        fileOverrides.userAppendHead = true;
      }
      if (fileOverrides.appendBody) {
        fileOverrides.userAppendBody = true;
      }
      delete fileOverrides.appendHead;
      delete fileOverrides.appendBody;
      delete fileOverrides.appendHeadExtra;
      delete fileOverrides.appendBodyExtra;
    }
    var mergedOptions = Object.assign({}, exportOptions, fileOverrides);
    Object.keys(mergedOptions).map((item) => {
      mergedOptions[item] = 'unset' == mergedOptions[item] ? '' : mergedOptions[item];
    });
    return mergedOptions;
  };
  var timerId = null;
  ProjectSettingsBridge.prototype.cacheSetting = async function () {
    this.projectSetting = await this.getCalculatedProjectSetting();
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      this.editor.imgEdit.refreshLocalImg();
    }, 100);
  };
  ProjectSettingsBridge.prototype.loadFromFile = function () {
    var fileSetting = this.editor.docMenu.buildMetaMap();
    this.fileSetting = fileSetting;
    return this.fileSetting;
  };
  ProjectSettingsBridge.prototype.loadFromProject = async function (unusedParameter1) {};
  ProjectSettingsBridge.prototype.getCalculatedProjectSetting = async function () {
    const mergeProjectSettings = () => {
      var mergedSettings = {};
      for (record of this.levels) {
        Object.assign(mergedSettings, record[1]);
      }
      return mergedSettings;
    };
    if (this.isLoadingProjectSetting) {
      return new Promise((resolvePromise) => {
        setTimeout(() => {
          if (this.isLoadingProjectSetting) {
            setTimeout(() => {
              resolvePromise(mergeProjectSettings());
            }, 500);
          } else {
            resolvePromise(mergeProjectSettings());
          }
        }, 100);
      });
    } else {
      return mergeProjectSettings();
    }
  };
  ProjectSettingsBridge.prototype.onFilePathChanged = async function () {
    console.debug('onFilePathChanged');
    if (this.prevFilePath !== File.bundle.filePath) {
      this.prevFilePath = File.bundle.filePath;
      var levels = [],
        cachedDirectory = null;
      for (record of this.levels) {
        if (!File.bundle.filePath.startsWith(record[0])) {
          break;
        }
        cachedDirectory = record[0];
        levels.push(record);
      }
      this.levels = levels;
      await this.loadFromProject(cachedDirectory);
    }
  };
  ProjectSettingsBridge.prototype.searchProjectConfigByNode = async function (stopDirectory) {
    if (!stopDirectory) {
      this.levels = [];
      stopDirectory = '';
    }
    const pathUtilities = reqnode('path'),
      fileSystemExtra = reqnode('fs-extra');
    var startDirectory = fileIntegration.getCurrentFileFolderPath() || File.getMountFolder();
    if (!startDirectory) {
      return;
    }
    const readEditorConfig = async (directoryPath) => {
        try {
          var configText = await fileSystemExtra.readFile(directoryPath + '/.editorConfig', 'utf8');
          if (!configText) {
            return;
          }
          var localItems = this.parseFromString(configText),
            editorConfig = {};
          localItems.map((item) => {
            if (!item[0]) {
              editorConfig.notRoot = 'true' !== item[1].root;
            }
            if (!(item[0] && 'marklyra' !== item[0])) {
              editorConfig = Object.assign(
                editorConfig,
                normalizeSettings((settingKey) => item[1][settingKey]),
              );
            }
          });
          return editorConfig;
        } catch (error) {
          console.debug(error);
        }
        return null;
      },
      readMarkLyraConfig = async (directoryPath) => {
        try {
          var configText = await fileSystemExtra.readFile(
            directoryPath + '/.marklyraConfig',
            'utf8',
          );
          if (!configText) {
            return;
          }
          var sectionValues = this.parseFromString(configText)[0][1];
          return normalizeSettings((settingKey) => sectionValues[settingKey]);
        } catch (error) {}
        return null;
      };
    for (
      var reachedEditorConfigRoot = false,
        foundProjectConfig = false,
        currentDirectory = (startDirectory = pathUtilities.normalize(startDirectory)),
        discoveredLevels = [];
      currentDirectory.length > 1 &&
      stopDirectory != currentDirectory &&
      ((this.isLoadingProjectSetting = true), !reachedEditorConfigRoot || !foundProjectConfig);
    ) {
      var [editorConfig, projectConfig] = await Promise.all([
        reachedEditorConfigRoot ? Promise.resolve(null) : readEditorConfig(currentDirectory),
        foundProjectConfig ? Promise.resolve(null) : readMarkLyraConfig(currentDirectory),
      ]);
      reachedEditorConfigRoot = reachedEditorConfigRoot || !(editorConfig || {}).notRoot;
      foundProjectConfig = !!projectConfig;
      var mergedConfig = null;
      if (
        (mergedConfig =
          editorConfig && projectConfig
            ? Object.assign(editorConfig, projectConfig)
            : projectConfig || editorConfig)
      ) {
        items.map((item) => {
          var relativeSettingPath = mergedConfig[item];
          if (relativeSettingPath) {
            mergedConfig[item] = utilities.getAbsolutePath(currentDirectory, relativeSettingPath);
          }
        });
        discoveredLevels.push([currentDirectory, mergedConfig]);
      }
      currentDirectory = utilities.pathByDeleteLastComponent(currentDirectory);
    }
    this.levels = this.levels.concat(discoveredLevels.reverse());
    this.cacheSetting();
    console.debug('searchProjectConfigByNode', this.levels);
  };
  var iniPatterns = {
    section: /^\s*\[(([^#;]|\\#|\\;)+)\]\s*([#;].*)?$/,
    param: /^\s*([\w\.\-\_]+)\s*[=:]\s*(.*?)\s*([#;].*)?$/,
    comment: /^\s*[!#;].*$/,
    eatNextLine: /\\\s*$/,
  };
  ProjectSettingsBridge.prototype.parseFromString = function (text) {
    var sectionValues = {},
      sectionName = null,
      localItems = [[sectionName, sectionValues]];
    function unescapeConfigValue(inputText) {
      return inputText.replace(/\\([\s\\])/g, '$1').replace(/^[ \t]|[ \t]$/g, '');
    }
    var continuationKey = false;
    text.split(/\r\n|\r|\n/).forEach(function (item) {
      var match;
      if (continuationKey) {
        sectionValues[continuationKey] += unescapeConfigValue(item);
        continuationKey = !!iniPatterns.eatNextLine.exec(item) && continuationKey;
      } else {
        if (!iniPatterns.comment.test(item)) {
          if (iniPatterns.param.test(item)) {
            match = item.match(iniPatterns.param);
            sectionValues[match[1]] = unescapeConfigValue(match[2]);
            if (!match[3] && iniPatterns.eatNextLine.exec(match[2])) {
              continuationKey = match[1];
            }
          } else {
            if (iniPatterns.section.test(item)) {
              match = item.match(iniPatterns.section);
              sectionName = match[1].toLowerCase();
              sectionValues = {};
              localItems.push([sectionName, sectionValues]);
            }
          }
        }
      }
    });
    return localItems;
  };
  ProjectSettingsBridge.prototype.show = async function () {
    File.editor.library.tmpHideSidebar(true);
    var element = document.querySelector('#marklyra-local-setting');
    if (element) {
      element.contentWindow.postMessage(
        {
          type: 'reload',
          initData: {
            workspaceSetting: await this.getCalculatedProjectSetting(),
            fileSetting: this.fileSetting,
          },
        },
        '*',
      );
    } else {
      element = this.initFrame();
    }
    document.body.classList.add('marklyra-show-local-setting');
  };
  ProjectSettingsBridge.prototype.close = function () {
    File.editor.library.recoverSidebar();
    document.body.classList.remove('marklyra-show-local-setting');
  };
  ProjectSettingsBridge.prototype.initFrame = function () {
    var IFRAMEElement = document.createElement('IFRAME');
    IFRAMEElement.setAttribute('id', 'marklyra-local-setting');
    IFRAMEElement.setAttribute('src', 'http://localhost:3000/local-setting.html?os=win');
    document.body.appendChild(IFRAMEElement);
    window.addEventListener(
      'message',
      async (messageEvent) => {
        if (messageEvent.source !== IFRAMEElement.contentWindow) {
          return;
        }
        var { type: messageType, _callbackID: current_callbackID } = messageEvent.data;
        const sendSettingsResponse = (callbackResult) => {
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
        if ('closeLocalSetting' == messageType) {
          this.close();
        } else {
          if ('fetchLocalSetting' == messageType) {
            sendSettingsResponse({
              userLocale: File.option.userLocale,
              workspaceSetting: await this.getCalculatedProjectSetting(),
              fileSetting: this.fileSetting,
            });
          }
        }
        sendSettingsResponse();
      },
      false,
    );
    return IFRAMEElement;
  };
  moduleRecord.exports = ProjectSettingsBridge;
}
