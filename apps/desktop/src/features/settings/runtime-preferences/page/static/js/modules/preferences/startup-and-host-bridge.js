// Webpack module 41: startup-and-host-bridge.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  webpackRequire.r(moduleExports),
    function (unusedParameter1) {
      var objectSpread = webpackRequire(6),
        generatorRuntime = webpackRequire(7),
        generatorRuntimeDefault = webpackRequire.n(generatorRuntime),
        asyncToGenerator = webpackRequire(9),
        react = webpackRequire(0),
        reactDefault = webpackRequire.n(react),
        reactDom = webpackRequire(10),
        reactDomDefault = webpackRequire.n(reactDom),
        preferencesPanels = webpackRequire(36),
        fetchPolyfill = webpackRequire(22),
        keyboardShortcuts = webpackRequire(13);
      webpackRequire(23);
      window.isNode = window.require;
      var userDataPath,
        documentsPath,
        tempPath,
        settingsIpcRenderer = null,
        settingsLoaded = !1,
        w = function () {
          return window.isNode ? window._options.userLocale : window._options.locale;
        },
        loadDictionaryJson = (function () {
          var fetchDictionaryAsync = Object(asyncToGenerator.a)(
            generatorRuntimeDefault.a.mark(function e(dictionaryUrl) {
              return generatorRuntimeDefault.a.wrap(
                function (generatorContext) {
                  for (;;)
                    switch ((generatorContext.prev = generatorContext.next)) {
                      case 0:
                        return (
                          (generatorContext.prev = 0),
                          (generatorContext.next = 3),
                          fetch(dictionaryUrl)
                        );
                      case 3:
                        return (generatorContext.next = 5), generatorContext.sent.json();
                      case 5:
                        return generatorContext.abrupt('return', generatorContext.sent);
                      case 8:
                        (generatorContext.prev = 8),
                          (generatorContext.t0 = generatorContext.catch(0)),
                          console.warn(generatorContext.t0);
                      case 11:
                        return generatorContext.abrupt('return', {});
                      case 12:
                      case 'end':
                        return generatorContext.stop();
                    }
                },
                e,
                null,
                [[0, 8]],
              );
            }),
          );
          return function (inputUnusedParameter1) {
            return fetchDictionaryAsync.apply(this, arguments);
          };
        })();
      window.loadDict = function (locale) {
        if (!locale) locale = window._options.locale;
        return false
          ? new Promise(function (resolvePromise) {
              setTimeout(function () {
                resolvePromise({
                  Front: {},
                  Menu: {},
                  Panel: {
                    'Word Count': '\u5b57\u6570\u7edf\u8ba1',
                    'Paper Size': '\u7eb8\u5f20\u5927\u5c0f',
                  },
                });
              }, 100);
            })
          : Promise.all([
              loadDictionaryJson('./locales/' + locale + '.lproj/Front.json'),
              loadDictionaryJson('./locales/' + locale + '.lproj/Menu.json'),
              loadDictionaryJson('./locales/' + locale + '.lproj/Panel.json'),
              loadDictionaryJson('./locales/' + locale + '.lproj/Welcome.json'),
            ]).then(function (result) {
              return Promise.resolve({
                Front: result[0],
                Menu: result[1],
                Panel: result[2],
                Welcome: result[3],
              });
            });
      };
      var Dict = {
        Front: {},
        Menu: {},
        Panel: {},
        Welcome: {},
        get: function (key, dictionaryGroup) {
          return Dict[dictionaryGroup || 'Panel'][key] || key;
        },
      };
      window.Dict = Dict;
      var k = function () {
        console.log('render...'),
          window.isMac
            ? document.body.classList.add(
                'mac-os-' + (window._options.osVersion || '10').substr(0, 2),
              )
            : /Mac\ OS\ X\ 11_/.exec(window.navigator.appVersion) &&
              document.body.classList.add('mac-os-11'),
          (window.useMirrorInCN = window._options.useMirrorInCN),
          reactDomDefault.a.render(
            reactDefault.a.createElement(preferencesPanels.a, window._options),
            document.getElementById('root'),
          );
      };
      if (
        ((window.reloadData = function (forceRender) {
          console.log('window.reloadData'),
            settingsIpcRenderer.invoke('setting.getExtraOption').then(function (result) {
              if (
                (console.log('setting.getExtraOption done'),
                (window._options = JSON.parse(result)),
                (window.dirname = window._options.dirname),
                (function () {
                  var nodeModule = window.require('module'),
                    pathUtilities = window.require('path'),
                    searchValue = pathUtilities.join(window.dirname, 'node_modules.asar');
                  nodeModule.globalPaths.push(searchValue);
                  var require = nodeModule.prototype.require;
                  nodeModule.prototype.require = function (requestedModule) {
                    return (
                      -1 == this.paths.indexOf(searchValue) && this.paths.push(searchValue),
                      /(\.node$)|(\/build\/Release)/.exec(requestedModule) &&
                        '.' == requestedModule[0] &&
                        (requestedModule = pathUtilities
                          .resolve(pathUtilities.dirname(this.id), requestedModule)
                          .replace(/\bnode_modules\.asar\b/, 'node_modules')),
                      require.call(this, requestedModule)
                    );
                  };
                })(),
                (tempPath = window._options.tempPath),
                (userDataPath = window._options.userDataPath),
                (documentsPath = window._options.documentsPath),
                !settingsLoaded || forceRender)
              ) {
                settingsLoaded = !0;
                var preferredLocale = w();
                'Base' !== preferredLocale && preferredLocale
                  ? window.loadDict(preferredLocale).then(function (inputResult) {
                      (Dict = Object(objectSpread.a)(
                        Object(objectSpread.a)({}, Dict),
                        inputResult,
                      )),
                        k();
                    })
                  : settingsLoaded && k();
              }
            });
        }),
        (window.forceReload = function () {
          return (
            window.__MARKLYRA_SETTINGS_BRIDGE__ ? k() : window.isNode && window.reloadData(!0), !0
          );
        }),
        window.isNode)
      ) {
        var electron = window.require('electron');
        (settingsIpcRenderer = electron.ipcRenderer),
          window.reloadData(),
          settingsIpcRenderer.on('executeJavaScript', function (inputUnusedParameter1, scriptText) {
            window.eval(scriptText);
          });
      }
      window.__MARKLYRA_SETTINGS_BRIDGE__ && (documentsPath = window._options._documentPath),
        (window._options = Object(objectSpread.a)({}, window._options)),
        window.fetch || (fetch = fetchPolyfill.a);
      var itemIndex = 0,
        pendingCallbacks = {};
      window.onMessageCallback = function (callbackMessage) {
        var callback = pendingCallbacks[callbackMessage.id];
        callback && callback.apply(null, callbackMessage.data),
          delete pendingCallbacks[callbackMessage.id];
      };
      var O = function (channel) {
          for (
            var currentElectron = window.require('electron'),
              ipcRenderer = currentElectron.ipcRenderer,
              argumentsLength = arguments.length,
              items = new Array(argumentsLength > 1 ? argumentsLength - 1 : 0),
              currentItemIndex = 1;
            currentItemIndex < argumentsLength;
            currentItemIndex++
          )
            items[currentItemIndex - 1] = arguments[currentItemIndex];
          return ipcRenderer.invoke.apply(null, [channel].concat(items));
        },
        S = function (name, messageData, callback) {
          itemIndex++,
            callback && (pendingCallbacks[itemIndex] = callback),
            window.__MARKLYRA_SETTINGS_BRIDGE__ &&
              window.__MARKLYRA_SETTINGS_BRIDGE__.postMessage({
                name: name,
                data: messageData,
                id: itemIndex + '',
              });
        };
      if (
        ((window.Setting = {
          locale: function () {
            return w();
          },
          userDataPath: function () {
            return userDataPath;
          },
          documentPath: function () {
            return documentsPath;
          },
          close: function () {
            settingsIpcRenderer.sendToHost('close');
          },
          quit: function () {
            window.Setting.invoke('quit');
          },
          put: function (key, settingValue) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('put', { key: key, value: settingValue })
              : window.isNode && settingsIpcRenderer.invoke('setting.put', key, settingValue);
          },
          invoke: function (channel) {
            for (
              var argumentsLength = arguments.length,
                items = new Array(argumentsLength > 1 ? argumentsLength - 1 : 0),
                currentItemIndex = 1;
              currentItemIndex < argumentsLength;
              currentItemIndex++
            )
              items[currentItemIndex - 1] = arguments[currentItemIndex];
            if (window.isNode)
              return settingsIpcRenderer.invoke.apply(null, [channel].concat(items));
            window.__MARKLYRA_SETTINGS_BRIDGE__ && S(channel, items[0]);
          },
          invokeWithCallback: function (channel) {
            for (
              var argumentsLength = arguments.length,
                items = new Array(argumentsLength > 1 ? argumentsLength - 1 : 0),
                currentItemIndex = 1;
              currentItemIndex < argumentsLength;
              currentItemIndex++
            )
              items[currentItemIndex - 1] = arguments[currentItemIndex];
            return window.isNode
              ? settingsIpcRenderer.invoke.apply(null, [channel].concat(items))
              : window.__MARKLYRA_SETTINGS_BRIDGE__
                ? new Promise(function (resolvePromise) {
                    S(channel, items[0] || null, resolvePromise);
                  })
                : void 0;
          },
          invokeWithUserFeedback: (function () {
            var invokeFeedbackAsync = Object(asyncToGenerator.a)(
              generatorRuntimeDefault.a.mark(function e(channel) {
                var Setting,
                  argumentsLength,
                  items,
                  currentItemIndex,
                  sent,
                  argumentsValue = arguments;
                return generatorRuntimeDefault.a.wrap(function (generatorContext) {
                  for (;;)
                    switch ((generatorContext.prev = generatorContext.next)) {
                      case 0:
                        for (
                          argumentsLength = argumentsValue.length,
                            items = new Array(argumentsLength > 1 ? argumentsLength - 1 : 0),
                            currentItemIndex = 1;
                          currentItemIndex < argumentsLength;
                          currentItemIndex++
                        )
                          items[currentItemIndex - 1] = argumentsValue[currentItemIndex];
                        return (
                          (generatorContext.next = 3),
                          (Setting = window.Setting).invokeWithCallback.apply(
                            Setting,
                            [channel].concat(items),
                          )
                        );
                      case 3:
                        (sent = generatorContext.sent),
                          window.Setting.showMessageBox(
                            sent || window.Dict.get('Operation Succeed'),
                          );
                      case 5:
                      case 'end':
                        return generatorContext.stop();
                    }
                }, e);
              }),
            );
            return function (inputUnusedParameter1) {
              return invokeFeedbackAsync.apply(this, arguments);
            };
          })(),
          showMessageBox: (function () {
            var showMessageAsync = Object(asyncToGenerator.a)(
              generatorRuntimeDefault.a.mark(function e(message) {
                var sent, response;
                return generatorRuntimeDefault.a.wrap(function (generatorContext) {
                  for (;;)
                    switch ((generatorContext.prev = generatorContext.next)) {
                      case 0:
                        if (window.isNode) {
                          generatorContext.next = 2;
                          break;
                        }
                        return generatorContext.abrupt('return', window.alert(message));
                      case 2:
                        return (
                          (generatorContext.next = 4),
                          O('dialog.showMessageBox', { message: message })
                        );
                      case 4:
                        return (
                          (sent = generatorContext.sent),
                          (response = sent.response),
                          generatorContext.abrupt('return', 0 == response)
                        );
                      case 7:
                      case 'end':
                        return generatorContext.stop();
                    }
                }, e);
              }),
            );
            return function (inputUnusedParameter1) {
              return showMessageAsync.apply(this, arguments);
            };
          })(),
          showLicense: function () {
            window.Setting.invoke('license.show', !0);
          },
          execCommand: function (commandText) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('execCommand', commandText)
              : window.isNode && settingsIpcRenderer.send('execForAll', commandText.toString());
          },
          evaluateInHost: function (scriptText) {
            window.isNode && settingsIpcRenderer.sendToHost('evaluateInHost', scriptText);
          },
          syncToPreference: function (preferenceUpdate) {
            window.isNode && settingsIpcRenderer.send('syncToPreference', preferenceUpdate);
          },
          checkUpdates: function () {
            window.isWin && settingsIpcRenderer.invoke('updater.checkForUpdates', !0),
              window.__MARKLYRA_SETTINGS_BRIDGE__ && S('checkForUpdates');
          },
          selectFolder: function (defaultPath, onSelected) {
            window.isNode
              ? settingsIpcRenderer
                  .invoke('dialog.showOpenDialog', {
                    defaultPath: defaultPath || void 0,
                    properties: ['openDirectory', 'promptToCreate', 'dontAddToRecent'],
                  })
                  .then(function (result) {
                    var filePaths = result.filePaths;
                    onSelected((filePaths || [null])[0] || null);
                  })
              : window.__MARKLYRA_SETTINGS_BRIDGE__
                ? S('selectFolderOrFile', { dir: !0, defaultPath: defaultPath }, onSelected)
                : onSelected(prompt('selectFolder', defaultPath));
          },
          selectFile: function (defaultPath, filters, onSelected) {
            window.isNode
              ? settingsIpcRenderer
                  .invoke('dialog.showOpenDialog', {
                    defaultPath: defaultPath || void 0,
                    filters: filters,
                    properties: ['openFile', 'dontAddToRecent'],
                  })
                  .then(function (result) {
                    var filePaths = result.filePaths;
                    onSelected((filePaths || [null])[0] || null);
                  })
              : window.__MARKLYRA_SETTINGS_BRIDGE__
                ? S(
                    'selectFolderOrFile',
                    {
                      dir: !1,
                      defaultPath: defaultPath,
                      filters: filters && 1 == filters.length ? filters[0].extensions : null,
                    },
                    onSelected,
                  )
                : onSelected(prompt('selectFile', defaultPath));
          },
          openFolder: function (folderPath) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('openFolder', folderPath)
              : window.isNode && settingsIpcRenderer.invoke('shell.openItem', folderPath);
          },
          openLink: function (text) {
            window.useMirrorInCN &&
              (text = text.replace(/support\.marklyra\.io/, 'support.marklyraio.cn')),
              window.__MARKLYRA_SETTINGS_BRIDGE__
                ? S('openLink', text)
                : window.isNode
                  ? settingsIpcRenderer.invoke('shell.openExternal', text)
                  : window.open(text);
          },
          showAlert: function (message) {
            window.isNode
              ? settingsIpcRenderer.invoke('dialog.showMessageBox', {
                  message: message,
                  buttons: ['OK'],
                })
              : alert(message);
          },
          showConfirm: function (message) {
            if (window.isNode)
              return settingsIpcRenderer
                .invoke('dialog.showMessageBox', {
                  title: window.Dict.get('Confirm'),
                  message: message,
                  buttons: [window.Dict.get('OK'), window.Dict.get('Cancel')],
                  cancelId: 1,
                })
                .then(function (result) {
                  return 0 === result.response;
                });
            var confirmed = window.confirm(message);
            return Promise.resolve(confirmed);
          },
          exitFocusAndTypewriterMode: function () {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('exitFocusAndTypewriterMode')
              : window.isNode &&
                (window.Setting.put('isFocusMode', !1),
                window.Setting.put('isTypeWriterMode', !1),
                window.Setting.execCommand(
                  'function(){File.isFocusMode = false; File.isTypeWriterMode = false; File.editor.updateFocusMode(false); File.editor.setTypeWriterMode(false, true);document.body.classList.remove("marklyra-show-notification");}',
                ),
                window.Setting.evaluateInHost('ClientCommand.refreshViewMenu()')),
              window.Setting.showAlert(
                window.Dict.get('Typewriter / Focus Mode have been turned off.'),
              );
          },
          updateEnableDebug: function (debugEnabled) {
            window.__MARKLYRA_SETTINGS_BRIDGE__ && S('updateDebugMode', debugEnabled);
          },
          updateWindowStyle: function (windowStyle) {
            window.__MARKLYRA_SETTINGS_BRIDGE__ && S('updateWindowStyle', windowStyle);
          },
          updatePandocPath: function (pandocPath) {
            window.__MARKLYRA_SETTINGS_BRIDGE__ && S('updatePandocPath', pandocPath);
          },
          updateAlwaysShowWordCount: function (showWordCount) {
            window.__MARKLYRA_SETTINGS_BRIDGE__ && S('updateAlwaysShowWordCount', showWordCount);
          },
          updateImageSaveLocation: function (imageSaveLocation) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('updateImageSaveLocation', imageSaveLocation)
              : window.isNode &&
                window.Setting.execCommand(
                  'function(){File.setDefaultImageStorage(' +
                    JSON.stringify(imageSaveLocation) +
                    ');}',
                );
          },
          setSmartQuote: function (smartQuoteEnabled) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('setSmartQuote', smartQuoteEnabled)
              : window.isNode &&
                window.Setting.evaluateInHost(
                  'File.megaMenu.setSmartQuote(' + smartQuoteEnabled + ')',
                );
          },
          setSmartDash: function (smartDashEnabled) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('setSmartDash', smartDashEnabled)
              : window.Setting.evaluateInHost(
                  'File.megaMenu.setSmartDash(' + smartDashEnabled + ')',
                );
          },
          updateMenuForNode: function (menuPatch) {
            window
              .require('electron')
              .ipcRenderer.send('menu.updateMenu', JSON.stringify(menuPatch));
          },
          setConvertOnRendering: function (convertDuringRendering) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('setConvertOnRendering', convertDuringRendering)
              : window.isNode &&
                window.Setting.evaluateInHost(
                  'File.megaMenu.setSmartyPantsTiming(' + convertDuringRendering + ')',
                );
          },
          setRemapPunctuation: function (remapPunctuation) {
            window.__MARKLYRA_SETTINGS_BRIDGE__
              ? S('setRemapPunctuation', remapPunctuation)
              : window.isNode &&
                window.Setting.evaluateInHost(
                  'File.megaMenu.setRemapPunctuation(' + remapPunctuation + ')',
                );
          },
          setTheme: function () {
            window.isNode && window.Setting.invoke('theme.apply'), window.isMac && S('applyTheme');
          },
          reloadExportMenu: function () {
            window.isNode && window.Setting.invoke('menu.reloadExportMenu'),
              window.isMac && S('reloadExportMenu');
          },
          openUnsavedDraft: function () {
            settingsIpcRenderer.sendToHost('openUnsavedDraft');
          },
          doResetAdvancedSettings: function (resetOptions) {
            window.Setting.invoke('setting.resetAdvancedSettings', resetOptions);
          },
          existsDir: function (directoryPath) {
            if (window.isNode) {
              var fileSystemExtra = window.require('fs-extra');
              try {
                return fileSystemExtra.lstatSync(directoryPath).isDirectory();
              } catch (error) {}
              return !1;
            }
            return !0;
          },
          testImageUploader: function (
            inputUnusedParameter1,
            reportResult,
            unusedParameter3,
            unusedParameter4,
          ) {
            var i = function (command, rawOutput, errorOutput) {
                if (!cancelled)
                  if (rawOutput) {
                    var images = (function (text) {
                      for (
                        var parts = text.split(/\r?\n/),
                          uploadedUrls = [],
                          currentItemIndex = parts.length - 1;
                        currentItemIndex >= 0;
                        currentItemIndex--
                      ) {
                        var trimmedText = parts[currentItemIndex].trim();
                        if (trimmedText)
                          if (/^(https?|ftp|file):\//.exec(trimmedText))
                            uploadedUrls.unshift(trimmedText);
                          else if (
                            /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}\/.*$/.exec(trimmedText)
                          )
                            uploadedUrls.unshift('http://' + trimmedText);
                          else if (uploadedUrls.length) break;
                      }
                      return uploadedUrls;
                    })(rawOutput);
                    2 != images.length
                      ? reportResult({
                          command: command,
                          rawOutput: rawOutput || errorOutput,
                          rawError: !1,
                          finalError: !0,
                        })
                      : reportResult({
                          command: command,
                          rawOutput: rawOutput,
                          rawError: !1,
                          finalError: !1,
                          images: images,
                        });
                  } else
                    reportResult({
                      command: command,
                      rawOutput: errorOutput || '(none)',
                      rawError: !0,
                      finalError: !0,
                    });
              },
              r = function (command, rawOutput, inputRawOutput) {
                if (!cancelled)
                  if (inputRawOutput)
                    reportResult({
                      command: command,
                      rawOutput: inputRawOutput,
                      rawError: !0,
                      finalError: !0,
                    });
                  else {
                    var images = [];
                    try {
                      images = JSON.parse(rawOutput);
                    } catch (error) {}
                    images.success && 2 == images.result.length
                      ? reportResult({
                          command: command,
                          rawOutput: rawOutput,
                          rawError: !1,
                          finalError: !1,
                          images: images,
                        })
                      : reportResult({
                          command: command,
                          rawOutput: rawOutput,
                          rawError: !1,
                          finalError: !0,
                        });
                  }
              };
            var cancelled = !1;
            return function () {
              cancelled = !0;
            };
          },
        }),
        window.isUnibody && document.body.classList.add('unibody-window'),
        window.isNode &&
          settingsIpcRenderer.on('syncToPreference', function (inputUnusedParameter1, scriptText) {
            window.eval(scriptText);
          }),
        Object(keyboardShortcuts.a)('esc', function (event, unusedParameter2) {
          'INPUT' === event.target.nodeName ||
            document.querySelector('.modal-backdrop') ||
            (event.preventDefault(), window.Setting.close());
        }),
        window.isMac)
      ) {
        var dictionariesLoaded = !1;
        window.loadDict(w()).then(function (result) {
          (Dict = Object(objectSpread.a)(Object(objectSpread.a)({}, Dict), result)),
            (window.Dict = Dict),
            (dictionariesLoaded = !0),
            k();
        }),
          setTimeout(function () {
            !dictionariesLoaded && k();
          }, 1e3);
      } else
        window.isNode ||
          window.loadDict().then(function (result) {
            (Dict = Object(objectSpread.a)(Object(objectSpread.a)({}, Dict), result)),
              (window.Dict = Dict),
              (dictionariesLoaded = !0),
              k();
          });
    }.call(this, webpackRequire(32));
});
