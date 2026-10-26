// host/clipboard-bridge.
export default function initializeHostClipboardBridge(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var electron,
    utilities = requireModule('shared/utilities'),
    bridge = window.bridge,
    ipcRenderer = null;
  if (window.reqnode) {
    electron = reqnode('electron');
    ipcRenderer = electron.ipcRenderer;
  }
  var cachedCaseInsensitive = null,
    JSBridge = {
      clipboard: {
        readText: function () {
          if (window.reqnode) {
            return electron.clipboard.readText() || '';
          } else {
            if (bridge) {
              return bridge.callSync('clipboard.readText');
            } else {
              return void 0;
            }
          }
        },
        writeForMac: function (clipboardData, shouldClear) {
          return bridge.callHandler('clipboard.write', {
            data: clipboardData,
            shouldClear: !!shouldClear,
          });
        },
        read: function (clipboardEvent, initialContent) {
          var clipboardContent = initialContent || {},
            dataTransfer =
              clipboardEvent && (clipboardEvent.clipboardData || clipboardEvent.dataTransfer);
          if (dataTransfer) {
            clipboardContent.html = dataTransfer.getData('text/html');
            clipboardContent.markhtml = dataTransfer.getData('text/markhtml');
            clipboardContent.text = dataTransfer.getData('text/plain');
            clipboardContent.files = Array.from(dataTransfer.files || [])
              .map((item) => item.path)
              .filter((item) => !!item);
          }
          if (bridge) {
            return new Promise(function (resolvePromise, rejectPromise) {
              bridge.callHandler('clipboard.read', {}, function (nativeClipboard) {
                if (!clipboardContent.markhtml) {
                  clipboardContent.markhtml = nativeClipboard.markhtml;
                }
                clipboardContent.html = (nativeClipboard.html || [])[0] || clipboardContent.html;
                clipboardContent.baseUrlInClipboard = (nativeClipboard.html || [])[1] || '';
                clipboardContent.remap = (nativeClipboard.html || [])[2];
                clipboardContent.from = (nativeClipboard.html || [])[3];
                if ('Apple Notes' == clipboardContent.from) {
                  var htmlContainer = $('<div>' + clipboardContent.html + '</div>');
                  htmlContainer.children('p').each(function () {
                    if ('17px' == this.style.fontSize && 'B' == (this.children[0] || {}).tagName) {
                      $(this)
                        .find('b')
                        .replaceWith(function () {
                          return this.innerHTML;
                        });
                      $(this).replaceWith('<h1>' + this.innerHTML + '</h1>');
                    } else {
                      if (
                        '14px' == this.style.fontSize &&
                        'B' == (this.children[0] || {}).tagName
                      ) {
                        $(this)
                          .find('b')
                          .replaceWith(function () {
                            return this.innerHTML;
                          });
                        $(this).replaceWith('<h2>' + this.innerHTML + '</h2>');
                      }
                    }
                  });
                  clipboardContent.html = htmlContainer.html();
                }
                if (
                  !clipboardContent.markhtml &&
                  /^version:/i.exec((nativeClipboard.html || [])[0] || '')
                ) {
                  clipboardContent.html = clipboardContent.html.replace(/^[^<]+/, '');
                  clipboardContent.fromFirefox = true;
                }
                if (!(clipboardContent.text && (dataTransfer || clipboardContent.html))) {
                  clipboardContent.text = nativeClipboard.text;
                }
                clipboardContent.files = nativeClipboard.files || [];
                resolvePromise(clipboardContent);
              });
            });
          }
          if (File.isWin) {
            if (!clipboardContent.html) {
              var text = (electron.clipboard.readBuffer('FileNameW') || new Uint8Array()).toString(
                'ucs2',
              );
              if ((text = text.replace(new RegExp(String.fromCharCode(0), 'g'), ''))) {
                clipboardContent.files = [text];
              }
            }
            return Promise.resolve(clipboardContent);
          }
          return Promise.resolve(clipboardContent);
        },
        readImage: function () {
          var imgEdit = File.editor.imgEdit;
          return new Promise((resolvePromise, rejectPromise) => {
            var imageStorageFolder = imgEdit.getTargetImageStorageFolder();
            if (bridge) {
              bridge.callHandler(
                'clipboard.readImage',
                {
                  imageStorageFolder: imageStorageFolder,
                  silent: imageStorageFolder == imgEdit.getTargetImageStorageFolderFromSetting(),
                },
                resolvePromise,
              );
            } else {
              if (window.reqnode) {
                var nativeImage = electron.clipboard.readImage();
                if (nativeImage && !nativeImage.isEmpty()) {
                  if (!(imageStorageFolder && 'upload' != imageStorageFolder)) {
                    imageStorageFolder = _options.userDataPath + '/marklyra-user-images';
                  }
                  imgEdit.prepImageMove(imageStorageFolder, false, void 0, true).then(
                    async function () {
                      var destinationPath = reqnode('path').join(
                        imageStorageFolder,
                        'image-' + utilities.dateToNumberString(new Date()) + '.png',
                      );
                      reqnode('fs').writeFile(destinationPath, nativeImage.toPNG(), (error) => {
                        resolvePromise(error ? null : [destinationPath]);
                      });
                    },
                    () => {},
                  );
                } else {
                  resolvePromise(null);
                }
              } else {
                resolvePromise(null);
              }
            }
          });
        },
      },
      menu: {
        update: function (menuUpdate, menuValue) {
          if (menuUpdate) {
            if (menuValue && 'string' == typeof menuUpdate) {
              var menuKey = menuUpdate;
              (menuUpdate = {})[menuKey] = menuValue;
            }
            if (File.isNode) {
              ipcRenderer.send('menu.updateMenu', JSON.stringify(menuUpdate));
            } else {
              if (bridge) {
                bridge.callHandler('menu.updateMenu', menuUpdate);
              }
            }
          }
        },
      },
      zoom: {
        zoomIn: function () {
          if (window.reqnode) {
            ClientCommand.execForAll(function () {
              ClientCommand.zoomIn();
            });
            ClientCommand.refreshViewMenu();
          } else {
            if (bridge) {
              bridge.callHandler('window.zoomIn');
            }
          }
        },
        zoomOut: function () {
          if (window.reqnode) {
            ClientCommand.execForAll(function () {
              ClientCommand.zoomOut();
            });
            ClientCommand.refreshViewMenu();
          } else {
            if (bridge) {
              bridge.callHandler('window.zoomOut');
            }
          }
        },
        resetZoom: function () {
          if (window.reqnode) {
            ClientCommand.execForAll(function () {
              ClientCommand.resetZoom();
            });
            ClientCommand.refreshViewMenu();
          } else {
            if (bridge) {
              bridge.callHandler('window.resetZoom');
            }
          }
        },
        setZoom: function (zoomFactor) {
          if (window.reqnode) {
            reqnode('electron').webFrame.setZoomFactor(zoomFactor || 1);
          }
        },
      },
      invoke: function (channel, ...argumentsList) {
        if (bridge) {
          return new Promise((resolvePromise, rejectPromise) => {
            bridge.callHandler(channel, argumentsList[0], resolvePromise);
          });
        } else {
          if (ipcRenderer) {
            if (
              'function' == typeof (argumentsList = argumentsList || [])[argumentsList.length - 1]
            ) {
              return ipcRenderer.invoke
                .apply(null, [channel].concat(argumentsList.slice(0, -1)))
                .then(argumentsList[argumentsList.length - 1]);
            } else {
              return ipcRenderer.invoke.apply(null, [channel].concat(argumentsList));
            }
          } else {
            return Promise.resolve();
          }
        }
      },
      sendIPC: function (channel, payload) {
        if (ipcRenderer) {
          ipcRenderer.send(channel, payload);
        }
      },
      putSetting: function (key, settingValue) {
        if (bridge) {
          bridge.callHandler('setting.put', { key: key, value: settingValue });
        } else {
          JSBridge.invoke('setting.put', key, settingValue);
        }
      },
      execForAll: function (commandText) {
        if (window.reqnode) {
          ClientCommand.execForAll(commandText);
        } else {
          if (bridge) {
            bridge.callHandler('window.execForAll', commandText);
          }
        }
      },
      showInFinder: function (filePath) {
        if (filePath) {
          if (File.isMac) {
            bridge.callHandler('path.showInFinder', filePath);
          } else {
            if (filePath) {
              JSBridge.invoke('shell.showItemInFolder', filePath);
            }
          }
        }
      },
      openFolder: function (folderPath) {
        if (folderPath) {
          if (File.isMac) {
            bridge.callHandler('path.openFolderInFinder', folderPath);
          } else {
            JSBridge.invoke('shell.openItem', folderPath);
          }
        }
      },
      openFile: function (filePath) {
        if (filePath) {
          if (File.isMac) {
            bridge.callHandler('path.openFile', filePath);
          } else {
            JSBridge.invoke('shell.openItem', filePath);
          }
        }
      },
      showInBrowser: function (externalUrl) {
        if (File.isMac) {
          bridge.callHandler('path.openURL', externalUrl);
        } else {
          if (externalUrl) {
            JSBridge.invoke('shell.openExternal', externalUrl);
          }
        }
      },
      selectFile: function (defaultPath, filters, onSelected) {
        if (File.isNode) {
          JSBridge.invoke('dialog.showOpenDialog', {
            defaultPath: defaultPath || void 0,
            filters: filters,
            properties: ['openFile', 'dontAddToRecent'],
          }).then(({ filePaths: selectedPaths }) => {
            onSelected((selectedPaths || [null])[0] || null);
          });
        } else {
          if (File.isMac) {
            bridge.callHandler(
              'path.selectFolderOrFile',
              {
                dir: false,
                defaultPath: defaultPath,
                filters: filters ? filters.map((item) => item.extensions) : null,
              },
              (selectedPath) => {
                onSelected(selectedPath);
              },
            );
          }
        }
      },
      fsCaseInsensitive: function () {
        if (null === cachedCaseInsensitive) {
          if (File.isNode) {
            cachedCaseInsensitive = File.isWin || reqnode('fs-plus').isCaseInsensitive;
          }
          if (File.isMac) {
            cachedCaseInsensitive = true;
          }
        }
        return cachedCaseInsensitive;
      },
    };
  window.JSBridge = JSBridge;
  moduleExports.JSBridge = JSBridge;
}
