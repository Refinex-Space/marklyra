// export/pandoc.
export default function initializeExportPandoc(requireModule, moduleExports, moduleRecord) {
  'use strict';
  if (!this) {
    self;
  }
  var pandocAdapter = void 0;
  if (window.reqnode) {
    var importDialog,
      spawn = reqnode('child_process').spawn,
      utilities = requireModule('shared/utilities'),
      dialogs = requireModule('ui/dialogs'),
      fileIntegration = requireModule('host/file-integration'),
      activeProcess = (requireModule('document/recovery'), null),
      getPandocCommand = () => File.option.pandocPath || 'pandoc',
      runPandoc = function (argumentsList, onClose, outputPath, spawnOptions) {
        stopActivePandoc();
        if (!(spawnOptions || {}).cwd) {
          let cwd = fileIntegration.getCurrentFileFolderPath();
          if (cwd) {
            spawnOptions = Object.assign({ cwd: cwd }, spawnOptions);
          }
        }
        console.debug('pandoc ' + argumentsList.join(' '));
        var items = [],
          currentItems = [];
        (activeProcess = spawn(getPandocCommand(), argumentsList, spawnOptions)).on(
          'close',
          function (exitCode) {
            var standardOutput = Buffer.concat(items),
              standardError = Buffer.concat(currentItems).toString();
            console.debug('close spawn');
            onClose(outputPath, standardOutput, standardError, exitCode);
            activeProcess = null;
          },
        );
        activeProcess.stdout.on('data', function (outputChunk) {
          items.push(outputChunk);
        });
        activeProcess.stderr.on('data', function (errorChunk) {
          currentItems.push(errorChunk);
        });
        return activeProcess;
      },
      stopActivePandoc = function () {
        if (activeProcess && activeProcess.kill) {
          activeProcess.removeAllListeners('close');
          activeProcess.kill();
        }
        activeProcess = null;
      },
      checkPandocAvailability = async function (silent) {
        var pandocVersion = await JSBridge.invoke('pandoc.version'),
          available = void 0 === available ? void 0 : available && available + '' != 'false';
        if (silent && void 0 !== available) {
          return available;
        }
        if (available) {
          window.pandocVersion = pandocVersion;
          return true;
        }
        try {
          available = true;
          var versionOutput = await ((...spawnArguments) =>
            new Promise(function (resolvePromise, rejectPromise) {
              var standardOutput = '',
                standardError = '',
                versionProcess = spawn.apply(null, spawnArguments);
              versionProcess.stdout.on('data', function (outputChunk) {
                standardOutput += outputChunk;
              });
              versionProcess.stderr.on('data', function (errorChunk) {
                standardError += errorChunk;
              });
              versionProcess.on('error', rejectPromise).on('close', function (exitCode) {
                if (0 === exitCode) {
                  resolvePromise(standardOutput);
                } else {
                  rejectPromise(standardError);
                }
              });
            }))(getPandocCommand(), ['--version'], { windowsHide: true });
          pandocVersion = ((versionOutput = (versionOutput.toString('utf8').split(/\r|\n|\r\n/) ||
            [])[0]).match(/[\d.]{2,}/) || [])[0];
          available = utilities.compareVersion(pandocVersion, '2.0') >= 0;
          window.pandocVersion = pandocVersion;
        } catch (error) {
          available = false;
          console.sendError(error, false);
        }
        if (!(available || silent)) {
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
            backdrop: false,
            callback: function (buttonIndex) {
              document.body.classList.remove('marklyra-show-notification');
              if (0 == buttonIndex) {
                JSBridge.invoke(
                  'app.openFile',
                  window.dirname + '/Docs/Install and Use Pandoc.md',
                  { forceCreateWindow: true },
                );
              }
              if (1 == buttonIndex) {
                dialogs.dialog.hide();
                setTimeout(showPandocPathDialog, 10);
              }
            },
          });
        }
        JSBridge.invoke('pandoc.setVersion', available ? pandocVersion : 'false');
        return available;
      },
      pathPickerBound = false,
      showPandocPathDialog = function () {
        dialogs.showDialog({
          title: $.localize.getString('Pandoc Path', 'Panel'),
          html: `<div class='input-group marklyra-pandoc-path-select-row'><input id='marklyra-pandoc-path-input' type='text' value='${File.option.pandocPath || ''}' placeholder='(auto detect)'/><button id='marklyra-pandoc-path-select' type='button' class='btn' marklyra-hint='${$.localize.getString('Select', 'Panel')}'><i class='fa fa-folder' aria-hidden='true'/></button><button id='marklyra-pandoc-path-reset' type='button' class='btn'><i class='fa fa-times-circle' aria-hidden='true' marklyra-hint='${$.localize.getString('Reset', 'Panel')}'></i></button></div>`,
          buttons: [$.localize.getString('OK', 'Panel'), $.localize.getString('Cancel', 'Panel')],
          backdrop: false,
          callback: function (buttonIndex) {
            if (0 == buttonIndex) {
              JSBridge.invoke('pandoc.setVersion', void 0);
              File.option.pandocPath = $('#marklyra-pandoc-path-input').val().trim();
              JSBridge.putSetting('pandocPath', File.option.pandocPath);
              JSBridge.execForAll(
                `File.option.pandocPath=${JSON.stringify(File.option.pandocPath)}`,
              );
            }
          },
        });
        if (!pathPickerBound) {
          pathPickerBound = true;
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
            });
        }
      },
      reuseUntitledWindow = false;
    pandocAdapter = {
      prepImport: async function () {
        reuseUntitledWindow = false;
        if (await checkPandocAvailability()) {
          reuseUntitledWindow = File.changeCounter.isDiscardableUntitled();
          JSBridge.invoke('pandoc.import', reuseUntitledWindow);
        }
      },
      import: function (sourcePath) {
        File.lock();
        File.blockUI = true;
        importDialog = $('#import-process-dialog');
        activeProcess = runPandoc(
          [
            sourcePath,
            '--quiet',
            '--wrap=none',
            '-t',
            'gfm-smart+tex_math_dollars-fenced_divs-bracketed_spans-raw_html',
          ],
          handlePandocImportResult,
          sourcePath,
        );
        setTimeout(function () {
          if (activeProcess) {
            importDialog.modal({ backdrop: 'static', keyboard: false });
            importDialog.find('.btn').one('click', function () {
              stopActivePandoc();
              if (!reuseUntitledWindow) {
                JSBridge.invoke('window.close');
              }
            });
          }
        }, 200);
      },
      runExportCommand: function (commandText, cwd) {
        stopActivePandoc();
        if (commandText) {
          return new Promise((resolvePromise) => {
            var error, message, code;
            (0, reqnode('child_process').exec)(
              commandText,
              { cwd: cwd },
              (executionError, standardOutput, standardError) => {
                if (executionError) {
                  console.log(`error: ${executionError.message}`);
                  return void resolvePromise({ code: -1, error: executionError.message });
                }
                if (standardError) {
                  console.log(`stderr: ${standardError}`);
                }
                error = standardError;
                message = standardOutput;
                if (!(void 0 === code)) {
                  resolvePromise({ code: code, error: error, message: message });
                }
              },
            ).on('exit', function (exitCode) {
              code = exitCode;
              if (!(void 0 === error && void 0 === message)) {
                resolvePromise({ code: code, error: error, message: message });
              }
            });
          });
        } else {
          return { code: -1, error: 'command is empty' };
        }
      },
      customExport: async function (outputPath, commandText, workingDirectory, exportOptions) {
        var commandResult = await pandocAdapter.runExportCommand(commandText, workingDirectory);
        handlePandocExportResult(
          outputPath || '',
          commandResult.message || '',
          commandResult.error || '',
          commandResult.code,
          [commandText],
          exportOptions,
        );
      },
      export: async function (format, exportOptions) {
        if (await checkPandocAvailability()) {
          var extensions;
          exportOptions = exportOptions || {};
          extensions =
            'pandoc' == format
              ? ((exportOptions.extensions || '').trim().split(/\s+/g) || []).map((text) =>
                  text.replace(/^\./, ''),
                )
              : 'native' == format
                ? ['']
                : getTargetExtensions(format, exportOptions);
          var outputPath = await fileIntegration.showExportDialog(extensions[0], exportOptions, [
            {
              name: 'pandoc' == format ? exportOptions.targetFormat : format,
              extensions: extensions,
            },
            { name: $.localize.getString('All Files', 'Panel'), extensions: [''] },
          ]);
          if (outputPath) {
            File.editor.export.recordLastExport(exportOptions, outputPath);
            File.blockUI = true;
            var customTarget = 'pandoc' == format || 'native' == format,
              argumentResult = buildPandocArguments(format, outputPath, exportOptions),
              textParts = argumentResult[0],
              showArguments = customTarget || argumentResult[1];
            console.debug('export using args: [' + textParts.join(', ') + ']');
            var dateInstance = new Date(),
              runNativeExport = function (markdownText, exportOptions) {
                textParts = textParts.map((item) =>
                  File.editor.export.processExportVariables(item, { outputPath: outputPath }),
                );
                (activeProcess = runPandoc(
                  textParts,
                  (outputPath, standardOutput, standardError, exitCode) => {
                    handlePandocExportResult(
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
                )).stdin.end(markdownText, 'utf8');
                importDialog = $('#export-process-dialog');
                var delay = Math.max(500 - new Date() + dateInstance, 0);
                setTimeout(function () {
                  if (activeProcess) {
                    importDialog.modal({ backdrop: 'static', keyboard: false });
                    importDialog.find('.btn').one('click', function () {
                      File.blockUI = false;
                      stopActivePandoc();
                      importDialog.modal('hide');
                    });
                  }
                }, delay);
              };
            if ('native' == format) {
              runNativeExport = function (markdownText) {
                reqnode('fs').writeFile(outputPath, markdownText, function (error) {
                  handlePandocExportResult(
                    outputPath,
                    '',
                    error,
                    error ? -1 : 0,
                    showArguments ? textParts : null,
                    exportOptions,
                  );
                });
              };
            }
            var directoryPath = reqnode('path').dirname(outputPath);
            File.editor.export.exportToNative(
              format,
              runNativeExport,
              directoryPath,
              exportOptions,
            );
          } else {
            document.body.classList.remove('marklyra-show-notification');
          }
        }
      },
    };
    var handlePandocExportResult = function (
        outputPath,
        standardOutput,
        standardError,
        exitCode,
        items,
        exportOptions,
      ) {
        if (importDialog) {
          importDialog.modal('hide');
        }
        document.body.classList.remove('marklyra-show-notification');
        File.blockUI = false;
        if (0 !== exitCode) {
          (function (text) {
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
            });
            console.sendError(text);
          })(standardError);
        } else {
          File.editor.export.onExportSuccess(
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
          );
        }
        File.editor.export.cleanUpTempFiles();
      },
      handlePandocImportResult = function (
        sourcePath,
        convertedBytes,
        standardError,
        unusedParameter4,
      ) {
        importDialog.modal('hide');
        File.unlock();
        File.blockUI = false;
        if (convertedBytes && 0 != convertedBytes.length) {
          console.debug('import success');
          File.reloadContent(convertedBytes.toString(), { skipUndo: true });
        } else {
          console.debug('import failed');
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
          });
        }
        File.updateChangeCount(File.ChangeType.NSChangeDone);
        stopActivePandoc();
      },
      getTargetExtensions = function (format, exportOptions) {
        var extensions = [format];
        if ('latex' == format) {
          extensions = ['tex', 'latex', 'txt'];
        } else {
          if ('wiki' == format) {
            extensions = ['wiki', 'txt'];
          } else {
            if ('rst' == format) {
              extensions = ['rst', 'text', 'rest', 'reStructuredText'];
            } else {
              if ('opml' == format) {
                extensions = ['opml', 'xml'];
              } else {
                if ('textile' == format) {
                  extensions = ['textile', 'txt', 'text'];
                } else {
                  if ('latex-pdf' == format) {
                    extensions = ['pdf'];
                  } else {
                    if ('pandoc' == format) {
                      extensions = exportOptions.extensions || [];
                    } else {
                      if ('markdown' == format) {
                        extensions = [
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
                        ];
                        if ('markdown_mmd' == exportOptions.variants) {
                          extensions = [
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
                          ];
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return extensions;
      },
      appendNamedOption = function (exportOptions, optionName, items, separateArgument) {
        var text = exportOptions[optionName];
        return (
          !(!text || !text.trim().length) &&
          (separateArgument
            ? (items.push(`--${optionName}`), items.push(text))
            : items.push(`--${optionName}=${/\d+/.exec(text) ? text : JSON.stringify(text)}`),
          true)
        );
      },
      buildPandocArguments = function (format, outputPath, exportOptions) {
        var items = ['-f', 'native', '-s', '-o', outputPath, '-t', format],
          customArguments = false;
        if ('wiki' == format) {
          items.pop();
          items.push('mediawiki');
        }
        if ('latex-pdf' == format) {
          items.pop();
          items.push('pdf');
        }
        if ('pandoc' == format) {
          customArguments = true;
          items.pop();
          if (exportOptions.targetFormat) {
            items.push(exportOptions.targetFormat);
          } else {
            items.pop();
          }
        }
        if ('markdown' == format) {
          customArguments = true;
          items.pop();
          items.push(exportOptions.variants || 'markdown');
          if (exportOptions.hardLineWrap) {
            items.push(`--columns=${exportOptions.columns || 130}`);
          }
          if (exportOptions.eol) {
            items.push(`--eol=${exportOptions.eol || 'native'}`);
          }
          if ('tab' == exportOptions.tab) {
            items.push('--preserve-tabs');
          } else {
            if (exportOptions.tab) {
              items.push(`--tab-stop=${exportOptions.tab || 4}`);
            }
          }
          if (exportOptions.ascii) {
            items.push('--ascii');
          }
          if (exportOptions['reference-links']) {
            items.push('--reference-links');
          }
          if (exportOptions['reference-location']) {
            items.push(
              `--reference-location=${exportOptions['--reference-location'] || 'document'}`,
            );
          }
          if (exportOptions['markdown-headings']) {
            items.push(`--markdown-headings=${exportOptions['--markdown-headings'] || 'atx'}`);
          }
          if (exportOptions.webtex) {
            items.push(
              `--webtex=https://latex.codecogs.com/${exportOptions['webtex-format'] || 'png'}.latex`,
            );
          }
        }
        var itemsLength = items.length;
        if (exportOptions.extraArguments) {
          items = items.concat(exportOptions.extraArguments);
        }
        appendNamedOption(exportOptions, 'reference-doc', items, true);
        appendNamedOption(exportOptions, 'template', items, true);
        appendNamedOption(exportOptions, 'css', items, true);
        appendNamedOption(exportOptions, 'split-level', items);
        appendNamedOption(exportOptions, 'toc-depth', items);
        if (appendNamedOption(exportOptions, 'toc', items)) {
          items.pop();
        }
        appendNamedOption(exportOptions, 'pdf-engine', items);
        return [items, customArguments || itemsLength !== items.length];
      };
    pandocAdapter.silentQuit = stopActivePandoc;
    pandocAdapter.validatePandocInstall = checkPandocAvailability;
  }
  moduleRecord.exports = pandocAdapter;
}
