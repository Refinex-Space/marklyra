// Webpack module 34: image-uploader.
// Registration order and sparse array indices are defined in bundles.json.
(function (moduleRecord, moduleExports, webpackRequire) {
  'use strict';
  (function (hostGlobal) {
    webpackRequire.d(moduleExports, 'a', function () {
      return b;
    });
    var generatorRuntime = webpackRequire(7),
      generatorRuntimeDefault = webpackRequire.n(generatorRuntime),
      asyncToGenerator = webpackRequire(9),
      slicedToArray = webpackRequire(5),
      react = webpackRequire(0),
      reactDefault = webpackRequire.n(react),
      controls = webpackRequire(2),
      localization = webpackRequire(1),
      p = function (resultProps) {
        var command = resultProps.command,
          rawOutput = resultProps.rawOutput,
          rawError = resultProps.rawError,
          images = resultProps.images,
          finalError = resultProps.finalError,
          closeAction = resultProps.closeAction;
        return reactDefault.a.createElement(
          controls.m,
          {
            title:
              null === finalError
                ? 'Validating\u2026'
                : finalError
                  ? 'Validation Failed'
                  : 'Validation Succeed',
            className: finalError ? 'modal-error' : !1 === finalError ? 'modal-success' : '',
            footer: reactDefault.a.createElement(
              'div',
              null,
              reactDefault.a.createElement(
                'button',
                {
                  className: 'btn btn-primary',
                  disabled: null === finalError,
                  onClick: closeAction,
                  style: { marginRight: '16px' },
                },
                Object(localization.a)('OK'),
              ),
              reactDefault.a.createElement(
                'button',
                {
                  className: 'btn btn-default',
                  style: { marginLeft: '16px' },
                  onClick: closeAction,
                },
                Object(localization.a)('Cancel'),
              ),
            ),
            onKeyDown: function (keyboardEvent) {
              if (null !== finalError && 27 == keyboardEvent.keyCode)
                return closeAction(), keyboardEvent.stopPropagation(), !1;
            },
          },
          command
            ? reactDefault.a.createElement(
                'h6',
                { className: 'console-label' },
                Object(localization.a)('Testing image uploading using command:'),
              )
            : null,
          command
            ? reactDefault.a.createElement('pre', { className: 'console-command' }, command)
            : null,
          null === finalError
            ? reactDefault.a.createElement(
                'h6',
                { className: 'console-label' },
                Object(localization.a)('Running\u2026 Waiting for results.'),
              )
            : reactDefault.a.createElement(
                reactDefault.a.Fragment,
                null,
                reactDefault.a.createElement(
                  'h6',
                  { className: 'console-label ' + (rawError ? 'console-label-error' : '') },
                  Object(localization.a)(
                    rawError ? 'Error from the console:' : 'Output from the console:',
                  ),
                ),
                reactDefault.a.createElement(
                  'pre',
                  { className: 'console-' + (rawError ? 'error' : 'info') },
                  rawOutput,
                ),
                rawError || !images
                  ? null
                  : reactDefault.a.createElement(
                      'h6',
                      {
                        className:
                          'console-label ' +
                          (finalError ? 'console-label-error' : 'console-label-success'),
                      },
                      Object(localization.a)(
                        finalError
                          ? 'Failed to fetch uploaded image from command output.'
                          : 'Successfully get uploaded image url.',
                      ),
                    ),
                images && images.length
                  ? reactDefault.a.createElement(
                      'pre',
                      { className: 'console-command' },
                      images.map(function (item) {
                        return reactDefault.a.createElement(
                          'a',
                          {
                            target: '__blank',
                            href: 'i',
                            style: { display: 'block' },
                            onClick: function () {
                              return window.Setting.openLink(item), !1;
                            },
                          },
                          item,
                        );
                      }),
                    )
                  : null,
              ),
        );
      },
      d = function (storageProps) {
        var saveLocation = storageProps.value,
          validatePath = storageProps.validatePath,
          customPath = storageProps.customPath,
          onChange = storageProps.onChange,
          ref = reactDefault.a.useRef(null),
          validationState = reactDefault.a.useState(validatePath && validatePath(customPath)),
          validationPair = Object(slicedToArray.a)(validationState, 2),
          validationError = validationPair[0],
          setValidationError = validationPair[1],
          timerId = null;
        var options = {
          '': 'No special action',
          textbundle: 'Convert to TextBundle',
          folder: 'Copy image to current folder (./)',
          assert: 'Copy image to ./assets',
          'per-file-assert': 'Copy image to ./${filename}.assets',
          ipic: 'Upload image',
          custom: 'Copy image to custom folder',
        };
        return (
          window.devVersion || delete options.textbundle,
          reactDefault.a.createElement(
            reactDefault.a.Fragment,
            null,
            reactDefault.a.createElement(controls.r, {
              keyName: 'image_save_location',
              value: saveLocation,
              onChange: function (settingKey, locationValue) {
                'custom' == locationValue &&
                  (setTimeout(function () {
                    ref.current && ref.current.focus();
                  }, 100),
                  onChange('custom_image_save_location', customPath || './${filename}'),
                  setValidationError(null)),
                  onChange(settingKey, locationValue || '');
              },
              options: options,
            }),
            'custom' !== saveLocation
              ? null
              : reactDefault.a.createElement(
                  reactDefault.a.Fragment,
                  null,
                  reactDefault.a.createElement(
                    'div',
                    { className: 'row', style: { display: 'flex', alignItems: 'center' } },
                    reactDefault.a.createElement('input', {
                      className: validationError ? 'on-error' : '',
                      ref: ref,
                      type: 'text',
                      value: customPath,
                      onChange: function (changeEvent) {
                        setValidationError(null),
                          onChange('custom_image_save_location', changeEvent.target.value);
                      },
                      onBlur: function (unusedParameter1) {
                        timerId = setTimeout(function () {
                          setValidationError(validatePath && validatePath(customPath));
                        }, 50);
                      },
                      style: { paddingLeft: '4px', flexGrow: '1', maxWidth: '80%' },
                      onFocus: function (focusEvent) {
                        timerId && clearTimeout(timerId), focusEvent.target.select();
                      },
                    }),
                    reactDefault.a.createElement(controls.i, {
                      hint: Object(localization.a)('Select custom folder'),
                      icon: 'folder',
                      style: { marginLeft: '1ch', cursor: 'pointer' },
                      onClick: function () {
                        timerId && clearTimeout(timerId);
                        var initialDirectory =
                          /^[\/]/.exec(customPath) || /^[a-z]+:\\/i.exec(customPath)
                            ? customPath
                            : null;
                        window.Setting.selectFolder(initialDirectory, function (selectedDirectory) {
                          selectedDirectory &&
                            onChange('custom_image_save_location', selectedDirectory);
                        });
                      },
                      hintPosition: 'bottom',
                    }),
                    reactDefault.a.createElement(controls.i, {
                      icon: 'cancel-circled',
                      style: { marginLeft: '8px' },
                      onClick: function () {
                        setValidationError(null),
                          onChange('custom_image_save_location', './${filename}');
                      },
                      hint: Object(localization.a)('Reset to Default'),
                      hintPosition: 'bottom',
                    }),
                  ),
                  validationError
                    ? reactDefault.a.createElement(
                        'div',
                        {
                          className: 'row on-error',
                          style: {
                            opacity: '0.8',
                            marginTop: '4px',
                            fontSize: '12px',
                            marginRight: '16px',
                            minHeight: 'initial',
                            userSelect: 'text',
                          },
                        },
                        validationError,
                      )
                    : null,
                  reactDefault.a.createElement(
                    'div',
                    {
                      className: 'row',
                      style: {
                        opacity: '0.8',
                        marginTop: '4px',
                        fontSize: '12px',
                        marginRight: '16px',
                        userSelect: 'text',
                        lineHeight: '1.2',
                      },
                    },
                    ' ',
                    Object(localization.a)(
                      "Please specify a relative path to current folder which begins with './' or '../', or an absolute folder path. (`${filename}` representing for currents filename.)",
                    ),
                  ),
                ),
          )
        );
      },
      m = function (appProps) {
        var app = appProps.app;
        return reactDefault.a.createElement(
          controls.k,
          {
            title: Object(localization.a)('When Insert\u2026'),
            hintLink: 'https://github.com/Refinex-Space/marklyra',
            dictGroup: 'Menu',
          },
          reactDefault.a.createElement(d, {
            value: app.getValue('image_save_location') || '',
            onChange: app.onChange,
            customPath: app.getValue('custom_image_save_location'),
            validatePath: app.imageFolderIsInvalid,
          }),
          reactDefault.a.createElement(controls.c, {
            style: { marginTop: '8px' },
            keyName: 'no_image_move_for_local',
            label: 'Apply above rules to local images',
            checked: !app.getValue('no_image_move_for_local'),
            onChange: app.onChange,
            reverse: !0,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'apply_image_move_for_web',
            label: 'Apply above rules to online images',
            checked: !!app.getValue('apply_image_move_for_web'),
            onChange: app.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'allow_image_upload',
            label: 'Allow upload images automatically based on YAML settings',
            checked: !!app.getValue('allow_image_upload'),
            onChange: app.onChange,
          }),
        );
      },
      h = function (appProps) {
        var app = appProps.app;
        return reactDefault.a.createElement(
          controls.k,
          {
            title: Object(localization.a)('Preferred Image Syntax'),
            hintLink: 'https://github.com/Refinex-Space/marklyra',
            dictGroup: 'Menu',
          },
          reactDefault.a.createElement(controls.c, {
            keyName: 'use_relative_path_for_img',
            label: 'Use relative path if possible',
            checked: !!app.getValue('use_relative_path_for_img'),
            onChange: app.onChange,
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'relativePathWithDot',
            label: 'Add ./ for relative path',
            checked: !!app.getValue('relativePathWithDot'),
            onChange: app.onChange,
            hint: 'When enabled, MarkLyra will use pattern like ./assets/image.png instead of assets/image.png when generating relative path for inserted images.',
            disabled: !app.getValue('use_relative_path_for_img'),
          }),
          reactDefault.a.createElement(controls.c, {
            keyName: 'autoEscapeImageURL',
            label: 'Auto escape image URL when insert',
            checked: !!app.getValue('autoEscapeImageURL'),
            onChange: app.onChange,
            hint: "For example, if you insert a file at 'img/example file.png', it will become 'img/example%20file.png'. Enable this for better compatibility with other Markdown engines, or disable this for better readability.",
          }),
        );
      },
      g = function () {
        if (!hostGlobal.require) return '';
        var pathSeparator = window.isWin ? '\\' : '/';
        return (
          window.Setting.userDataPath() +
          pathSeparator +
          'picgo' +
          pathSeparator +
          (window.isWin ? ('x64' == hostGlobal.process.arch ? 'win64' : 'win32') : 'linux') +
          pathSeparator +
          'picgo' +
          (window.isWin ? '.exe' : '')
        );
      },
      f = function (uploaderProps) {
        var app = uploaderProps.app,
          testResultState = reactDefault.a.useState(null),
          testResultPair = Object(slicedToArray.a)(testResultState, 2),
          testResult = testResultPair[0],
          setTestResult = testResultPair[1],
          downloadDialogState = reactDefault.a.useState(null),
          downloadDialogPair = Object(slicedToArray.a)(downloadDialogState, 2),
          showDownloadDialog = downloadDialogPair[0],
          setDownloadDialog = downloadDialogPair[1],
          text = app.getValue('image_uploader'),
          isChineseLocale = 'zh-Hans' == (window.Setting.locale() || ''),
          options = {
            '': 'None',
            ipic: 'iPic',
            upic: 'uPic',
            picsee: 'Picsee',
            'picgo-intro': 'PicGo-Core (command line)',
            'picgo-cli': 'PicGo-Core (command line)',
            'picgo-app': 'PicGo.app',
            'piclist-app': 'PicList',
            custom: Object(localization.a)('Custom Command'),
          };
        window.isNodeHtml
          ? ((options['picgo-app'] = 'PicGo (app)'),
            window.isMacNode || (delete options.upic, delete options.ipic, delete options.picsee),
            delete options['picgo-intro'])
          : delete options['picgo-cli'],
          isChineseLocale || window.isDebug || 'picgo-app' === text || delete options['picgo-app'];
        var rows = [
            [
              'Image Uploader',
              reactDefault.a.createElement(controls.r, {
                onChange: app.onChange,
                keyName: 'image_uploader',
                value: app.getValue('image_uploader'),
                options: options,
              }),
            ],
          ],
          uploaderNames = {
            ipic: 'iPic',
            'picgo-cli': 'PicGo-Core CLI',
            'picgo-intro': 'PicGo-Core CLI',
            'picgo-app': 'PicGo.app',
            'piclist-app': 'PicList',
            upic: 'uPic',
            picsee: 'Picsee',
          };
        window.isNodeHtml && (uploaderNames['picgo-app'] = 'PicGo (app)');
        var currentText = text;
        'custom' == text
          ? (currentText = app.getValue('custom_image_uploader'))
          : 'ipic' == text
            ? (currentText = 'ipic')
            : 'upic' == text
              ? (currentText = '/Applications/uPic.app/Contents/MacOS/uPic -o url -u')
              : 'picsee' == text
                ? (currentText = '/Applications/Picsee.app/Contents/MacOS/Picsee -u')
                : 'picgo-cli' == text &&
                  ((currentText = JSON.stringify(g()) + ' u'),
                  window.isWin && (currentText = 'chcp 65001| ' + currentText));
        var cancelUploadTest = null,
          S = function () {
            'ipic' == text &&
              window.Setting.openLink(
                isChineseLocale
                  ? 'https://itunes.apple.com/cn/app/id1101244278'
                  : 'https://itunes.apple.com/app/id1101244278',
              ),
              'upic' == text &&
                window.Setting.openLink(
                  isChineseLocale
                    ? 'https://blog.svend.cc/upic/'
                    : 'https://blog.svend.cc/upic/en/',
                ),
              'picgo-cli' == text && setDownloadDialog(!0),
              'picgo-intro' == text &&
                window.Setting.openLink('https://github.com/Refinex-Space/marklyra'),
              'picgo-app' == text && window.Setting.openLink('https://molunerfinn.com/PicGo/'),
              'piclist-app' == text && window.Setting.openLink('https://piclist.cn/'),
              'picsee' == text && window.Setting.openLink('https://enpicsee.chitaner.com/');
          },
          hintLink = 'https://github.com/Refinex-Space/marklyra';
        'ipic' == text && (hintLink += '#ipic-macos-freemium'),
          'upic' == text && (hintLink += '#upic-macos-opensource'),
          'picgo-cli' == text && (hintLink += '#picgo-core-command-line-opensource'),
          'picgo-app' == text && (hintLink += '#picgoapp-chinese-language-only'),
          'piclist-app' == text && (hintLink += '#piclist-chinese-language-only'),
          'picsee' == text && (hintLink += '#picsee-macos-freemium');
        var label = uploaderNames[text]
          ? Object(localization.a)('Download %@').replace('%@', uploaderNames[text])
          : null;
        if ('picgo-intro' == text)
          rows.splice(1, 0, [
            null,
            reactDefault.a.createElement(
              'span',
              null,
              reactDefault.a.createElement(controls.b, {
                label: Object(localization.a)('Instructions'),
                onClick: S,
              }),
            ),
          ]);
        else if (text) {
          'picgo-cli' == text &&
            ((label = Object(localization.a)('Download or Upgrade')),
            rows.splice(1, 0, [
              null,
              reactDefault.a.createElement(controls.b, {
                label: Object(localization.a)('Open Config File'),
                onClick: onClick,
              }),
            ]));
          var testButton = reactDefault.a.createElement(controls.b, {
              label: Object(localization.a)('Test Uploader'),
              onClick: function () {
                cancelUploadTest = window.Setting.testImageUploader(
                  currentText,
                  setTestResult,
                  app.getValue('picgo_app_path'),
                  app.getValue('piclistAppPath'),
                );
              },
              disabled: !currentText,
            }),
            instructionsHint = reactDefault.a.createElement(controls.h, {
              hint: 'Instructions',
              inlineHint: !0,
              hintLink: hintLink,
            });
          rows.splice(
            1,
            0,
            'custom' == text
              ? [testButton, instructionsHint]
              : [
                  testButton,
                  reactDefault.a.createElement(
                    'span',
                    null,
                    reactDefault.a.createElement(controls.b, { label: label, onClick: S }),
                    '\xa0\xa0',
                    instructionsHint,
                  ),
                ],
          );
        }
        'custom' == text &&
          rows.splice(1, 0, [
            Object(localization.a)('Command'),
            reactDefault.a.createElement('input', {
              type: 'text',
              value: app.getValue('custom_image_uploader') || '',
              onChange: function (changeEvent) {
                app.onChange('custom_image_uploader', changeEvent.target.value);
              },
              placeholder: Object(localization.a)('e.g: %@').replace(
                '%@',
                '"/usr/bin/uploader" --upload',
              ),
              style: { paddingLeft: '4px', flexGrow: '1', width: '90%' },
            }),
          ]),
          'picgo-app' == text &&
            window.isNodeHtml &&
            rows.splice(1, 0, [
              Object(localization.a)('PicGo Path'),
              reactDefault.a.createElement(controls.e, {
                keyName: 'picgo_app_path',
                value: app.getValue('picgo_app_path') || '',
                defaultPath: window.isWin ? 'C:\\Program Files\\PicGo\\PicGo.exe' : '',
                placeholder: Object(localization.a)('e.g: %@').replace(
                  '%@',
                  window.isWin ? 'C:\\Program Files\\PicGo\\PicGo.exe' : '/usr/bin/picgo',
                ),
                onChange: app.onChange,
                option: {
                  name: Object(localization.a)('Executable'),
                  extensions: [window.isWin ? 'exe' : '*'],
                },
              }),
            ]),
          'piclist-app' == text &&
            window.isNodeHtml &&
            rows.splice(1, 0, [
              Object(localization.a)('PicList Path'),
              reactDefault.a.createElement(controls.e, {
                keyName: 'piclistAppPath',
                value: app.getValue('piclistAppPath') || '',
                defaultPath: window.isWin ? 'C:\\Program Files\\PicList\\PicList.exe' : '',
                placeholder: Object(localization.a)('e.g: %@').replace(
                  '%@',
                  window.isWin ? 'C:\\Program Files\\PicList\\PicList.exe' : '/usr/bin/piclist',
                ),
                onChange: app.onChange,
                option: {
                  name: Object(localization.a)('Executable'),
                  extensions: [window.isWin ? 'exe' : '*'],
                },
              }),
            ]);
        return (
          window.process &&
            'marklyra' == window.process.env.SNAP_NAME &&
            rows.length > 1 &&
            rows.splice(1, 0, [
              reactDefault.a.createElement(controls.w, {
                text: 'You are using the Snap version, it may have limited access to your local executables.',
                link: 'Snap',
                app: app,
              }),
            ]),
          reactDefault.a.createElement(
            reactDefault.a.Fragment,
            null,
            reactDefault.a.createElement(
              controls.k,
              {
                title: Object(localization.a)('Image Upload Setting'),
                hintLink: 'https://github.com/Refinex-Space/marklyra',
                dictGroup: 'Menu',
              },
              reactDefault.a.createElement(controls.v, {
                rows: rows,
                className: 'image-upload-group',
              }),
            ),
            showDownloadDialog
              ? reactDefault.a.createElement(v, {
                  onCancel: function () {
                    setDownloadDialog(null);
                  },
                  onStartDownload: function () {
                    setDownloadDialog(null), y(app);
                  },
                })
              : null,
            testResult
              ? reactDefault.a.createElement(
                  p,
                  Object.assign(
                    {
                      closeAction: function () {
                        cancelUploadTest && cancelUploadTest(), setTestResult(null);
                      },
                    },
                    testResult,
                  ),
                )
              : null,
          )
        );
      };
    function b() {
      return reactDefault.a.createElement(
        controls.o,
        { active: 2 == this.state.activeTab, 'data-index': '2' },
        this.panelHeader(Object(localization.a)('Image', 'Menu')),
        reactDefault.a.createElement(m, { app: this }),
        reactDefault.a.createElement(h, { app: this }),
        reactDefault.a.createElement(f, { app: this }),
      );
    }
    var w = function (executablePath) {
        return new Promise(function (resolvePromise) {
          var fileSystem = hostGlobal.require('fs');
          fileSystem.access(executablePath, fileSystem.F_OK, function (accessError) {
            accessError
              ? resolvePromise(null)
              : hostGlobal
                  .require('child_process')
                  .execFile(
                    executablePath,
                    ['--version'],
                    function (executionError, standardOutput, message) {
                      resolvePromise(
                        executionError ? 'x' + (executionError.message || message) : standardOutput,
                      );
                    },
                  );
          });
        });
      },
      v = function (downloadProps) {
        var onCancel = downloadProps.onCancel,
          onStartDownload = downloadProps.onStartDownload,
          messageState = reactDefault.a.useState(Object(localization.a)('Checking\u2026')),
          messagePair = Object(slicedToArray.a)(messageState, 2),
          dialogMessage = messagePair[0],
          setDialogMessage = messagePair[1],
          titleState = reactDefault.a.useState(void 0),
          titlePair = Object(slicedToArray.a)(titleState, 2),
          title = titlePair[0],
          setDialogTitle = titlePair[1],
          buttonLabelState = reactDefault.a.useState('Download'),
          buttonLabelPair = Object(slicedToArray.a)(buttonLabelState, 2),
          buttonLabel = buttonLabelPair[0],
          setButtonLabel = buttonLabelPair[1];
        return (
          reactDefault.a.useEffect(function () {
            var executablePath = g();
            Promise.all([
              w(executablePath || ''),
              fetch('https://github.com/marklyra/PicGo-cli/releases/download/latest/version')
                .then(function (result) {
                  return result.text();
                })
                .catch(function (error) {
                  return Promise.resolve('x' + error.message);
                }),
            ]).then(function (result) {
              var text = result[0],
                currentText = result[1];
              return null == text
                ? (setDialogTitle(
                    Object(localization.a)('Download %@').replace(
                      '%@',
                      'PicGo-Core (command line)',
                    ),
                  ),
                  setDialogMessage(Object(localization.a)('Loading PicGo-Core License\u2026')),
                  fetch('https://raw.githubusercontent.com/PicGo/PicGo-Core/dev/License')
                    .then(function (inputResult) {
                      return inputResult.text();
                    })
                    .then(function (inputResult) {
                      setDialogMessage(
                        reactDefault.a.createElement(
                          reactDefault.a.Fragment,
                          null,
                          reactDefault.a.createElement(
                            'div',
                            null,
                            'PicGo-Core (command line) is a pre-built command line wrapper of PicGo-Core, license info for PicGo-Core is:',
                          ),
                          reactDefault.a.createElement('pre', null, inputResult),
                        ),
                      );
                    }),
                  void setButtonLabel(Object(localization.a)('Agree and Download')))
                : 'x' == text[0]
                  ? (setDialogTitle('Failed to get installed version of PicGo-Core (command line)'),
                    setDialogMessage(reactDefault.a.createElement('pre', null, text.substr(1))),
                    void setButtonLabel(Object(localization.a)('Download and Reinstall')))
                  : 'x' == currentText[0]
                    ? (setDialogTitle('Failed to get latest version of PicGo-Core (command line)'),
                      setDialogMessage(
                        reactDefault.a.createElement(
                          'pre',
                          null,
                          'Fetch https://github.com/marklyra/PicGo-cli/releases/download/latest/version return:',
                          reactDefault.a.createElement('br', null),
                          currentText.substr(1),
                        ),
                      ),
                      void setButtonLabel('Download'))
                    : (setDialogMessage(
                        Object(localization.a)('Latest version is $1, your version is $2')
                          .replace('$2', text)
                          .replace('$1', currentText),
                      ),
                      void (text.trim() == currentText.trim()
                        ? (setDialogTitle('You have the latest PicGo-Core (CLI)'),
                          setButtonLabel(Object(localization.a)('Download and Reinstall')))
                        : (setDialogTitle('Newer version is available'),
                          setButtonLabel(Object(localization.a)('Download')))));
            });
          }, []),
          reactDefault.a.createElement(
            controls.m,
            {
              title: title,
              footer: reactDefault.a.createElement(
                'div',
                null,
                reactDefault.a.createElement(
                  'button',
                  { className: 'btn btn-primary', onClick: onStartDownload },
                  Object(localization.a)(buttonLabel),
                ),
                reactDefault.a.createElement(
                  'button',
                  { className: 'btn btn-default', onClick: onCancel },
                  Object(localization.a)('Cancel'),
                ),
              ),
            },
            dialogMessage,
          )
        );
      },
      y = function () {
        window.Setting.invoke('setting.doDownloadPicgo');
      },
      onClick = (function () {
        var openConfigAsync = Object(asyncToGenerator.a)(
          generatorRuntimeDefault.a.mark(function t() {
            var fileSystemExtra, fileSystemPlus, electron, normalizedPath;
            return generatorRuntimeDefault.a.wrap(function (generatorContext) {
              for (;;)
                switch ((generatorContext.prev = generatorContext.next)) {
                  case 0:
                    return (
                      (fileSystemExtra = hostGlobal.require('fs-extra')),
                      (fileSystemPlus = hostGlobal.require('fs-plus')),
                      (electron = hostGlobal.require('electron')),
                      (normalizedPath = hostGlobal
                        .require('path')
                        .normalize(window._options.userPath + '/.picgo/config.json')),
                      fileSystemPlus.isFileSync(normalizedPath) ||
                        (fileSystemExtra.ensureFileSync(normalizedPath),
                        fileSystemExtra.writeFileSync(normalizedPath, '{\n\n}')),
                      (generatorContext.next = 7),
                      electron.shell.openPath(normalizedPath)
                    );
                  case 7:
                    generatorContext.sent &&
                      (window.isWin
                        ? hostGlobal
                            .require('child_process')
                            .spawn('C:\\windows\\notepad.exe', [normalizedPath])
                        : electron.shell.showItemInFolder(normalizedPath));
                  case 9:
                  case 'end':
                    return generatorContext.stop();
                }
            }, t);
          }),
        );
        return function () {
          return openConfigAsync.apply(this, arguments);
        };
      })();
  }).call(this, webpackRequire(32));
});
