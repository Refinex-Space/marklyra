// export/pandoc.
// SystemJS module 45. Dependencies: 11, 29, 33, 35.
$__System.registerDynamic(
  '45',
  ['11', '29', '33', '35'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var pandocAdapter = void 0;
    if (window.reqnode) {
      var importDialog,
        spawn = reqnode('child_process').spawn,
        utilities = requireModule('11'),
        dialogs = requireModule('29'),
        fileIntegration = requireModule('33'),
        activeProcess = (requireModule('35'), null),
        d = () => File.option.pandocPath || 'pandoc',
        u = function (argumentsList, onClose, outputPath, spawnOptions) {
          if ((h(), !(spawnOptions || {}).cwd)) {
            let cwd = fileIntegration.getCurrentFileFolderPath();
            cwd && (spawnOptions = Object.assign({ cwd: cwd }, spawnOptions));
          }
          console.debug('pandoc ' + argumentsList.join(' '));
          var items = [],
            currentItems = [];
          return (
            (activeProcess = spawn(d(), argumentsList, spawnOptions)).on(
              'close',
              function (exitCode) {
                var standardOutput = Buffer.concat(items),
                  standardError = Buffer.concat(currentItems).toString();
                console.debug('close spawn'),
                  onClose(outputPath, standardOutput, standardError, exitCode),
                  (activeProcess = null);
              },
            ),
            activeProcess.stdout.on('data', function (outputChunk) {
              items.push(outputChunk);
            }),
            activeProcess.stderr.on('data', function (errorChunk) {
              currentItems.push(errorChunk);
            }),
            activeProcess
          );
        },
        h = function () {
          activeProcess &&
            activeProcess.kill &&
            (activeProcess.removeAllListeners('close'), activeProcess.kill()),
            (activeProcess = null);
        },
        p = async function (silent) {
          var pandocVersion = await JSBridge.invoke('pandoc.version'),
            available = void 0 === available ? void 0 : available && available + '' != 'false';
          if (silent && void 0 !== available) return available;
          if (available) return (window.pandocVersion = pandocVersion), !0;
          try {
            available = !0;
            var versionOutput = await ((...spawnArguments) =>
              new Promise(function (resolvePromise, rejectPromise) {
                var standardOutput = '',
                  standardError = '',
                  versionProcess = spawn.apply(null, spawnArguments);
                versionProcess.stdout.on('data', function (outputChunk) {
                  standardOutput += outputChunk;
                }),
                  versionProcess.stderr.on('data', function (errorChunk) {
                    standardError += errorChunk;
                  }),
                  versionProcess.on('error', rejectPromise).on('close', function (exitCode) {
                    0 === exitCode ? resolvePromise(standardOutput) : rejectPromise(standardError);
                  });
              }))(d(), ['--version'], { windowsHide: !0 });
            (pandocVersion = ((versionOutput = (versionOutput
              .toString('utf8')
              .split(/\r|\n|\r\n/) || [])[0]).match(/[\d.]{2,}/) || [])[0]),
              (available = utilities.compareVersion(pandocVersion, '2.0') >= 0),
              (window.pandocVersion = pandocVersion);
          } catch (error) {
            (available = !1), console.sendError(error, !1);
          }
          return (
            available ||
              silent ||
              dialogs.showDialog({
                title: $.localize.getString('Require Pandoc to Continue...', 'Panel'),
                html: $.localize.getString(
                  "Import or some export features requires <a href='http://pandoc.org/' target='_blank'>Pandoc</a> (≥ v2.0) to be installed.",
                  'Panel',
                ),
                buttons: [
                  $.localize.getString('Follow Instructions to Install/Update Pandoc', 'Panel'),
                  $.localize.getString('Set Pandoc Path', 'Panel'),
                  $.localize.getString('Cancel', 'Panel'),
                ],
                tag: 'pandoc-warning',
                backdrop: !1,
                callback: function (buttonIndex) {
                  document.body.classList.remove('marklyra-show-notification'),
                    0 == buttonIndex &&
                      JSBridge.invoke(
                        'app.openFile',
                        window.dirname + '/Docs/Install and Use Pandoc.md',
                        { forceCreateWindow: !0 },
                      ),
                    1 == buttonIndex && (dialogs.dialog.hide(), setTimeout(m, 10));
                },
              }),
            JSBridge.invoke('pandoc.setVersion', available ? pandocVersion : 'false'),
            available
          );
        },
        pathPickerBound = !1,
        m = function () {
          dialogs.showDialog({
            title: $.localize.getString('Pandoc Path', 'Panel'),
            html: `<div class='input-group marklyra-pandoc-path-select-row'><input id='marklyra-pandoc-path-input' type='text' value='${File.option.pandocPath || ''}' placeholder='(auto detect)'/><button id='marklyra-pandoc-path-select' type='button' class='btn' marklyra-hint='${$.localize.getString('Select', 'Panel')}'><i class='fa fa-folder' aria-hidden='true'/></button><button id='marklyra-pandoc-path-reset' type='button' class='btn'><i class='fa fa-times-circle' aria-hidden='true' marklyra-hint='${$.localize.getString('Reset', 'Panel')}'></i></button></div>`,
            buttons: [$.localize.getString('OK', 'Panel'), $.localize.getString('Cancel', 'Panel')],
            backdrop: !1,
            callback: function (buttonIndex) {
              0 == buttonIndex &&
                (JSBridge.invoke('pandoc.setVersion', void 0),
                (File.option.pandocPath = $('#marklyra-pandoc-path-input').val().trim()),
                JSBridge.putSetting('pandocPath', File.option.pandocPath),
                JSBridge.execForAll(
                  `File.option.pandocPath=${JSON.stringify(File.option.pandocPath)}`,
                ));
            },
          }),
            pathPickerBound ||
              ((pathPickerBound = !0),
              dialogs.dialog.$dialog
                .on('click', '#marklyra-pandoc-path-select', function () {
                  JSBridge.selectFile(
                    File.option.pandocPath || '',
                    [{ name: 'Executable', extensions: [File.isWin ? 'exe' : ''] }],
                    (selectedPath) => {
                      $('#marklyra-pandoc-path-input').val(selectedPath || '');
                    },
                  );
                })
                .on('click', '#marklyra-pandoc-path-reset', function () {
                  $('#marklyra-pandoc-path-input').val('');
                }));
        },
        reuseUntitledWindow = !1;
      pandocAdapter = {
        prepImport: async function () {
          (reuseUntitledWindow = !1),
            (await p()) &&
              ((reuseUntitledWindow = File.changeCounter.isDiscardableUntitled()),
              JSBridge.invoke('pandoc.import', reuseUntitledWindow));
        },
        import: function (sourcePath) {
          File.lock(),
            (File.blockUI = !0),
            (importDialog = $('#import-process-dialog')),
            (activeProcess = u(
              [
                sourcePath,
                '--quiet',
                '--wrap=none',
                '-t',
                'gfm-smart+tex_math_dollars-fenced_divs-bracketed_spans-raw_html',
              ],
              y,
              sourcePath,
            )),
            setTimeout(function () {
              activeProcess &&
                (importDialog.modal({ backdrop: 'static', keyboard: !1 }),
                importDialog.find('.btn').one('click', function () {
                  h(), reuseUntitledWindow || JSBridge.invoke('window.close');
                }));
            }, 200);
        },
        runExportCommand: function (commandText, cwd) {
          return (
            h(),
            commandText
              ? new Promise((resolvePromise) => {
                  var error, message, code;
                  (0, reqnode('child_process').exec)(
                    commandText,
                    { cwd: cwd },
                    (executionError, standardOutput, standardError) => {
                      if (executionError)
                        return (
                          console.log(`error: ${executionError.message}`),
                          void resolvePromise({ code: -1, error: executionError.message })
                        );
                      standardError && console.log(`stderr: ${standardError}`),
                        (error = standardError),
                        (message = standardOutput),
                        void 0 === code ||
                          resolvePromise({ code: code, error: error, message: message });
                    },
                  ).on('exit', function (exitCode) {
                    (code = exitCode),
                      (void 0 === error && void 0 === message) ||
                        resolvePromise({ code: code, error: error, message: message });
                  });
                })
              : { code: -1, error: 'command is empty' }
          );
        },
        customExport: async function (outputPath, commandText, workingDirectory, exportOptions) {
          var commandResult = await pandocAdapter.runExportCommand(commandText, workingDirectory);
          v(
            outputPath || '',
            commandResult.message || '',
            commandResult.error || '',
            commandResult.code,
            [commandText],
            exportOptions,
          );
        },
        export: async function (format, exportOptions) {
          if (await p()) {
            var extensions;
            (exportOptions = exportOptions || {}),
              (extensions =
                'pandoc' == format
                  ? ((exportOptions.extensions || '').trim().split(/\s+/g) || []).map((text) =>
                      text.replace(/^\./, ''),
                    )
                  : 'native' == format
                    ? ['']
                    : b(format, exportOptions));
            var outputPath = await fileIntegration.showExportDialog(extensions[0], exportOptions, [
              {
                name: 'pandoc' == format ? exportOptions.targetFormat : format,
                extensions: extensions,
              },
              { name: $.localize.getString('All Files', 'Panel'), extensions: [''] },
            ]);
            if (outputPath) {
              File.editor.export.recordLastExport(exportOptions, outputPath), (File.blockUI = !0);
              var customTarget = 'pandoc' == format || 'native' == format,
                argumentResult = x(format, outputPath, exportOptions),
                textParts = argumentResult[0],
                showArguments = customTarget || argumentResult[1];
              console.debug('export using args: [' + textParts.join(', ') + ']');
              var dateInstance = new Date(),
                m = function (markdownText, exportOptions) {
                  (textParts = textParts.map((item) =>
                    File.editor.export.processExportVariables(item, { outputPath: outputPath }),
                  )),
                    (activeProcess = u(
                      textParts,
                      (outputPath, standardOutput, standardError, exitCode) => {
                        v(
                          outputPath,
                          standardOutput,
                          standardError,
                          exitCode,
                          showArguments ? textParts : null,
                          exportOptions,
                        );
                      },
                      outputPath,
                      { stdio: 'pipe', cwd: exportOptions.cwd },
                    )).stdin.end(markdownText, 'utf8'),
                    (importDialog = $('#export-process-dialog'));
                  var delay = Math.max(500 - new Date() + dateInstance, 0);
                  setTimeout(function () {
                    activeProcess &&
                      (importDialog.modal({ backdrop: 'static', keyboard: !1 }),
                      importDialog.find('.btn').one('click', function () {
                        (File.blockUI = !1), h(), importDialog.modal('hide');
                      }));
                  }, delay);
                };
              'native' == format &&
                (m = function (markdownText) {
                  reqnode('fs').writeFile(outputPath, markdownText, function (error) {
                    v(
                      outputPath,
                      '',
                      error,
                      error ? -1 : 0,
                      showArguments ? textParts : null,
                      exportOptions,
                    );
                  });
                });
              var directoryPath = reqnode('path').dirname(outputPath);
              File.editor.export.exportToNative(format, m, directoryPath, exportOptions);
            } else document.body.classList.remove('marklyra-show-notification');
          }
        },
      };
      var v = function (outputPath, standardOutput, standardError, exitCode, items, exportOptions) {
          importDialog && importDialog.modal('hide'),
            document.body.classList.remove('marklyra-show-notification'),
            (File.blockUI = !1),
            0 !== exitCode
              ? (function (text) {
                  dialogs.showDialog({
                    title: $.localize.getString('Export Failed', 'Panel'),
                    html:
                      (outputPath
                        ? $.localize
                            .getString('Failed to export file to <em>{0}</em>')
                            .format(utilities.escape(outputPath))
                        : '') +
                      '<br />' +
                      (items
                        ? `${$.localize.getString('Command Arguments:', 'Panel')}<pre style="user-select: all;">${items.map((item) => (items.length > 1 && /[\s'"]/.exec(item) && !/^['"-]/.exec(item) ? JSON.stringify(item) : item)).join(' ')}</pre>`
                        : '') +
                      `Error:<pre style='white-space: pre-line;' >${utilities.escape(text.substring(0, 500))}</pre>`,
                    type: 'error',
                    backdrop: 'static',
                  }),
                    console.sendError(text);
                })(standardError)
              : File.editor.export.onExportSuccess(
                  'pandoc',
                  outputPath,
                  exportOptions,
                  standardOutput,
                  standardError,
                  items &&
                    items.map((item) =>
                      items.length > 1 && /[\s'"]/.exec(item) && !/^['"-]/.exec(item)
                        ? JSON.stringify(item)
                        : item,
                    ),
                ),
            File.editor.export.cleanUpTempFiles();
        },
        y = function (sourcePath, convertedBytes, standardError, unusedParameter4) {
          importDialog.modal('hide'),
            File.unlock(),
            (File.blockUI = !1),
            convertedBytes && 0 != convertedBytes.length
              ? (console.debug('import success'),
                File.reloadContent(convertedBytes.toString(), { skipUndo: !0 }))
              : (console.debug('import failed'),
                dialogs.showDialog({
                  title: $.localize.getString('Import Failed', 'Panel'),
                  html:
                    $.localize
                      .getString('Failed to import file from <em>{0}</em>', 'Panel')
                      .format(utilities.escape(sourcePath)) +
                    '<br />' +
                    utilities.escape(standardError),
                  type: 'error',
                  backdrop: 'static',
                })),
            File.updateChangeCount(File.ChangeType.NSChangeDone),
            h();
        },
        b = function (format, exportOptions) {
          var extensions = [format];
          return (
            'latex' == format
              ? (extensions = ['tex', 'latex', 'txt'])
              : 'wiki' == format
                ? (extensions = ['wiki', 'txt'])
                : 'rst' == format
                  ? (extensions = ['rst', 'text', 'rest', 'reStructuredText'])
                  : 'opml' == format
                    ? (extensions = ['opml', 'xml'])
                    : 'textile' == format
                      ? (extensions = ['textile', 'txt', 'text'])
                      : 'latex-pdf' == format
                        ? (extensions = ['pdf'])
                        : 'pandoc' == format
                          ? (extensions = exportOptions.extensions || [])
                          : 'markdown' == format &&
                            ((extensions = [
                              'md',
                              'markdown',
                              'mmd',
                              'mkd',
                              'mkdown',
                              'rmd',
                              'qmd',
                              'rmarkdown',
                              'text',
                              'txt',
                            ]),
                            'markdown_mmd' == exportOptions.variants &&
                              (extensions = [
                                'mmd',
                                'md',
                                'markdown',
                                'mkd',
                                'mkdown',
                                'rmd',
                                'qmd',
                                'rmarkdown',
                                'text',
                                'txt',
                              ])),
            extensions
          );
        },
        w = function (exportOptions, optionName, items, separateArgument) {
          var text = exportOptions[optionName];
          return (
            !(!text || !text.trim().length) &&
            (separateArgument
              ? (items.push(`--${optionName}`), items.push(text))
              : items.push(`--${optionName}=${/\d+/.exec(text) ? text : JSON.stringify(text)}`),
            !0)
          );
        },
        x = function (format, outputPath, exportOptions) {
          var items = ['-f', 'native', '-s', '-o', outputPath, '-t', format],
            customArguments = !1;
          'wiki' == format && (items.pop(), items.push('mediawiki')),
            'latex-pdf' == format && (items.pop(), items.push('pdf')),
            'pandoc' == format &&
              ((customArguments = !0),
              items.pop(),
              exportOptions.targetFormat ? items.push(exportOptions.targetFormat) : items.pop()),
            'markdown' == format &&
              ((customArguments = !0),
              items.pop(),
              items.push(exportOptions.variants || 'markdown'),
              exportOptions.hardLineWrap && items.push(`--columns=${exportOptions.columns || 130}`),
              exportOptions.eol && items.push(`--eol=${exportOptions.eol || 'native'}`),
              'tab' == exportOptions.tab
                ? items.push('--preserve-tabs')
                : exportOptions.tab && items.push(`--tab-stop=${exportOptions.tab || 4}`),
              exportOptions.ascii && items.push('--ascii'),
              exportOptions['reference-links'] && items.push('--reference-links'),
              exportOptions['reference-location'] &&
                items.push(
                  `--reference-location=${exportOptions['--reference-location'] || 'document'}`,
                ),
              exportOptions['markdown-headings'] &&
                items.push(`--markdown-headings=${exportOptions['--markdown-headings'] || 'atx'}`),
              exportOptions.webtex &&
                items.push(
                  `--webtex=https://latex.codecogs.com/${exportOptions['webtex-format'] || 'png'}.latex`,
                ));
          var itemsLength = items.length;
          return (
            exportOptions.extraArguments && (items = items.concat(exportOptions.extraArguments)),
            w(exportOptions, 'reference-doc', items, !0),
            w(exportOptions, 'template', items, !0),
            w(exportOptions, 'css', items, !0),
            w(exportOptions, 'split-level', items),
            w(exportOptions, 'toc-depth', items),
            w(exportOptions, 'toc', items) && items.pop(),
            w(exportOptions, 'pdf-engine', items),
            [items, customArguments || itemsLength !== items.length]
          );
        };
      (pandocAdapter.silentQuit = h), (pandocAdapter.validatePandocInstall = p);
    }
    moduleRecord.exports = pandocAdapter;
  },
);
