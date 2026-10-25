// host/clipboard-bridge.
// SystemJS module 10. Dependencies: 11.
$__System.registerDynamic('10', ['11'], !0, function (requireModule, moduleExports, moduleRecord) {
  'use strict';
  this || self;
  var electron,
    utilities = requireModule('11'),
    bridge = window.bridge,
    ipcRenderer = null;
  window.reqnode && ((electron = reqnode('electron')), (ipcRenderer = electron.ipcRenderer));
  var cachedCaseInsensitive = null,
    JSBridge = {
      clipboard: {
        readText: function () {
          return window.reqnode
            ? electron.clipboard.readText() || ''
            : bridge
              ? bridge.callSync('clipboard.readText')
              : void 0;
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
          if (
            (dataTransfer &&
              ((clipboardContent.html = dataTransfer.getData('text/html')),
              (clipboardContent.markhtml = dataTransfer.getData('text/markhtml')),
              (clipboardContent.text = dataTransfer.getData('text/plain')),
              (clipboardContent.files = Array.from(dataTransfer.files || [])
                .map((item) => item.path)
                .filter((item) => !!item))),
            bridge)
          )
            return new Promise(function (resolvePromise, rejectPromise) {
              bridge.callHandler('clipboard.read', {}, function (nativeClipboard) {
                if (
                  (clipboardContent.markhtml ||
                    (clipboardContent.markhtml = nativeClipboard.markhtml),
                  (clipboardContent.html =
                    (nativeClipboard.html || [])[0] || clipboardContent.html),
                  (clipboardContent.baseUrlInClipboard = (nativeClipboard.html || [])[1] || ''),
                  (clipboardContent.remap = (nativeClipboard.html || [])[2]),
                  (clipboardContent.from = (nativeClipboard.html || [])[3]),
                  'Apple Notes' == clipboardContent.from)
                ) {
                  var htmlContainer = $('<div>' + clipboardContent.html + '</div>');
                  htmlContainer.children('p').each(function () {
                    '17px' == this.style.fontSize && 'B' == (this.children[0] || {}).tagName
                      ? ($(this)
                          .find('b')
                          .replaceWith(function () {
                            return this.innerHTML;
                          }),
                        $(this).replaceWith('<h1>' + this.innerHTML + '</h1>'))
                      : '14px' == this.style.fontSize &&
                        'B' == (this.children[0] || {}).tagName &&
                        ($(this)
                          .find('b')
                          .replaceWith(function () {
                            return this.innerHTML;
                          }),
                        $(this).replaceWith('<h2>' + this.innerHTML + '</h2>'));
                  }),
                    (clipboardContent.html = htmlContainer.html());
                }
                !clipboardContent.markhtml &&
                  /^version:/i.exec((nativeClipboard.html || [])[0] || '') &&
                  ((clipboardContent.html = clipboardContent.html.replace(/^[^<]+/, '')),
                  (clipboardContent.fromFirefox = !0)),
                  (clipboardContent.text && (dataTransfer || clipboardContent.html)) ||
                    (clipboardContent.text = nativeClipboard.text),
                  (clipboardContent.files = nativeClipboard.files || []),
                  resolvePromise(clipboardContent);
              });
            });
          if (File.isWin) {
            if (!clipboardContent.html) {
              var text = (electron.clipboard.readBuffer('FileNameW') || new Uint8Array()).toString(
                'ucs2',
              );
              (text = text.replace(new RegExp(String.fromCharCode(0), 'g'), '')) &&
                (clipboardContent.files = [text]);
            }
            return Promise.resolve(clipboardContent);
          }
          return Promise.resolve(clipboardContent);
        },
        readImage: function () {
          var imgEdit = File.editor.imgEdit;
          return new Promise((resolvePromise, rejectPromise) => {
            var imageStorageFolder = imgEdit.getTargetImageStorageFolder();
            if (bridge)
              bridge.callHandler(
                'clipboard.readImage',
                {
                  imageStorageFolder: imageStorageFolder,
                  silent: imageStorageFolder == imgEdit.getTargetImageStorageFolderFromSetting(),
                },
                resolvePromise,
              );
            else if (window.reqnode) {
              var nativeImage = electron.clipboard.readImage();
              nativeImage && !nativeImage.isEmpty()
                ? ((imageStorageFolder && 'upload' != imageStorageFolder) ||
                    (imageStorageFolder = _options.userDataPath + '/marklyra-user-images'),
                  imgEdit.prepImageMove(imageStorageFolder, !1, void 0, !0).then(
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
                  ))
                : resolvePromise(null);
            } else resolvePromise(null);
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
            File.isNode
              ? ipcRenderer.send('menu.updateMenu', JSON.stringify(menuUpdate))
              : bridge && bridge.callHandler('menu.updateMenu', menuUpdate);
          }
        },
      },
      zoom: {
        zoomIn: function () {
          window.reqnode
            ? (ClientCommand.execForAll(function () {
                ClientCommand.zoomIn();
              }),
              ClientCommand.refreshViewMenu())
            : bridge && bridge.callHandler('window.zoomIn');
        },
        zoomOut: function () {
          window.reqnode
            ? (ClientCommand.execForAll(function () {
                ClientCommand.zoomOut();
              }),
              ClientCommand.refreshViewMenu())
            : bridge && bridge.callHandler('window.zoomOut');
        },
        resetZoom: function () {
          window.reqnode
            ? (ClientCommand.execForAll(function () {
                ClientCommand.resetZoom();
              }),
              ClientCommand.refreshViewMenu())
            : bridge && bridge.callHandler('window.resetZoom');
        },
        setZoom: function (zoomFactor) {
          window.reqnode && reqnode('electron').webFrame.setZoomFactor(zoomFactor || 1);
        },
      },
      invoke: function (channel, ...argumentsList) {
        return bridge
          ? new Promise((resolvePromise, rejectPromise) => {
              bridge.callHandler(channel, argumentsList[0], resolvePromise);
            })
          : ipcRenderer
            ? 'function' == typeof (argumentsList = argumentsList || [])[argumentsList.length - 1]
              ? ipcRenderer.invoke
                  .apply(null, [channel].concat(argumentsList.slice(0, -1)))
                  .then(argumentsList[argumentsList.length - 1])
              : ipcRenderer.invoke.apply(null, [channel].concat(argumentsList))
            : Promise.resolve();
      },
      sendIPC: function (channel, payload) {
        ipcRenderer && ipcRenderer.send(channel, payload);
      },
      putSetting: function (key, settingValue) {
        bridge
          ? bridge.callHandler('setting.put', { key: key, value: settingValue })
          : JSBridge.invoke('setting.put', key, settingValue);
      },
      execForAll: function (commandText) {
        window.reqnode
          ? ClientCommand.execForAll(commandText)
          : bridge && bridge.callHandler('window.execForAll', commandText);
      },
      showInFinder: function (filePath) {
        filePath &&
          (File.isMac
            ? bridge.callHandler('path.showInFinder', filePath)
            : filePath && JSBridge.invoke('shell.showItemInFolder', filePath));
      },
      openFolder: function (folderPath) {
        folderPath &&
          (File.isMac
            ? bridge.callHandler('path.openFolderInFinder', folderPath)
            : JSBridge.invoke('shell.openItem', folderPath));
      },
      openFile: function (filePath) {
        filePath &&
          (File.isMac
            ? bridge.callHandler('path.openFile', filePath)
            : JSBridge.invoke('shell.openItem', filePath));
      },
      showInBrowser: function (externalUrl) {
        File.isMac
          ? bridge.callHandler('path.openURL', externalUrl)
          : externalUrl && JSBridge.invoke('shell.openExternal', externalUrl);
      },
      selectFile: function (defaultPath, filters, onSelected) {
        File.isNode
          ? JSBridge.invoke('dialog.showOpenDialog', {
              defaultPath: defaultPath || void 0,
              filters: filters,
              properties: ['openFile', 'dontAddToRecent'],
            }).then(({ filePaths: selectedPaths }) => {
              onSelected((selectedPaths || [null])[0] || null);
            })
          : File.isMac &&
            bridge.callHandler(
              'path.selectFolderOrFile',
              {
                dir: !1,
                defaultPath: defaultPath,
                filters: filters ? filters.map((item) => item.extensions) : null,
              },
              (selectedPath) => {
                onSelected(selectedPath);
              },
            );
      },
      fsCaseInsensitive: function () {
        return (
          null === cachedCaseInsensitive &&
            (File.isNode &&
              (cachedCaseInsensitive = File.isWin || reqnode('fs-plus').isCaseInsensitive),
            File.isMac && (cachedCaseInsensitive = !0)),
          cachedCaseInsensitive
        );
      },
    };
  (window.JSBridge = JSBridge), (moduleExports.JSBridge = JSBridge);
});
