// export/controller.
export default function initializeExportController(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(renderFootnoteLines, 'name', { value: 'S', configurable: true });

  if (!this) {
    self;
  }
  var documentModel = requireModule('model/document-model'),
    currentDocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    utilities = (documentModel.NodeCollectionUtils, requireModule('shared/utilities')),
    markdownParser = requireModule('model/markdown-parser'),
    inlineDecoration = requireModule('render/inline-decoration'),
    dialogs = (requireModule('export/html'), requireModule('ui/dialogs')),
    htmlBlocks = requireModule('render/html-blocks'),
    diagrams = requireModule('render/diagrams'),
    mathBlocks = requireModule('render/math-blocks'),
    fileIntegration = requireModule('host/file-integration'),
    mediaActions = requireModule('media/actions'),
    jquery = requireModule('libraries/jquery'),
    printAndImageExport = requireModule('export/print-and-images'),
    pandocExport = requireModule('export/pandoc'),
    fitExportedTables =
      (requireModule('host/environment'),
      function () {
        for (
          var elements = document.querySelectorAll('figure>table'), itemIndex = 0;
          itemIndex < elements.length;
          itemIndex++
        ) {
          var domNode = elements[itemIndex],
            parentElement = domNode.parentElement,
            scrollWidth = parentElement.scrollWidth,
            offsetWidth = parentElement.offsetWidth;
          if (scrollWidth > offsetWidth && scrollWidth > 50) {
            domNode.style.zoom = offsetWidth / scrollWidth;
            parentElement.style.overflowX = 'visible';
          }
        }
      }),
    normalizeFragmentLinks = Object.defineProperty(
      function () {
        for (
          var elements = document.querySelectorAll('#write a, #write [id]'),
            fragmentPattern = /^\s*#(.+)$/,
            escapeMap = {
              '\b': '\\b',
              '\t': '\\t',
              '\n': '\\n',
              '\f': '\\f',
              '\r': '\\r',
              '"': '\\"',
              "'": "\\'",
              '\\': '\\\\',
            },
            escapeFragmentSelector = Object.defineProperty(
              function (text) {
                return text
                  .replace(/["\\\b\t\n\f\r]/g, function (character) {
                    return escapeMap[character];
                  })
                  .replace(/\u200b/g, '');
              },
              'name',
              { value: 'i', configurable: true },
            ),
            itemIndex = 0;
          itemIndex < elements.length;
          itemIndex++
        ) {
          var match,
            domNode = elements[itemIndex],
            anchorName = domNode.getAttribute('name') || domNode.getAttribute('id'),
            linkTarget = domNode.getAttribute('href');
          if (!domNode.classList.contains('md-print-anchor')) {
            if (anchorName) {
              var aElement = document.createElement('a'),
                textNode = document.createTextNode(' ');
              aElement.appendChild(textNode);
              aElement.setAttribute('class', 'md-print-anchor');
              aElement.setAttribute('href', 'uaf://' + escapeFragmentSelector(anchorName));
              domNode.parentNode.insertBefore(aElement, domNode);
            }
            if (linkTarget && (match = fragmentPattern.exec(linkTarget))) {
              linkTarget = match[1];
              domNode.setAttribute('href', 'uat://' + escapeFragmentSelector(linkTarget));
            }
          }
        }
      },
      'name',
      { value: 'b', configurable: true },
    );
  var handleExportSuccess = Object.defineProperty(
      async function (exportType, outputPath, exportOptions, text, errorText, commandArguments) {
        if ('custom' == (exportOptions = exportOptions || {}).type) {
          exportType = 'custom';
        }
        var revealLabel = jquery.localize.getString(
            File.isMac ? 'Reveal in Finder' : 'Reveal in File Explorer',
            'Front',
          ),
          commandFailed = false,
          saveDialog = exportOptions.saveDialog;
        if (exportOptions.runCommand) {
          saveDialog = true;
          var commandText = ExportController.processExportVariables(
              exportOptions.runCommandStr || '',
              {
                outputPath: outputPath,
              },
            ),
            workingDirectory =
              fileIntegration.getCurrentFileFolderPath() || window._options.documentsPath || '/',
            commandResult = await (function (args, workingDirectory) {
              if (File.isNode) {
                return pandocExport.runExportCommand(args, workingDirectory);
              } else {
                if (File.isMac) {
                  return new Promise((resolvePromise) => {
                    bridge.callHandler(
                      'controller.runCommand',
                      { args: args, cwd: workingDirectory || '' },
                      function (responseTuple) {
                        resolvePromise({
                          code: responseTuple[0] ? 0 : -1,
                          message: responseTuple[1],
                          error: responseTuple[2],
                        });
                      },
                    );
                  });
                } else {
                  return void 0;
                }
              }
            })(commandText, workingDirectory);
          text = commandResult.message || '';
          if (0 != commandResult.code) {
            commandFailed = true;
            errorText = commandResult.error || '';
          }
        }
        if (commandFailed || exportOptions.showOutput) {
          var errorHtml = '',
            outputHtml = '';
          if (errorText) {
            errorHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(errorText)}</pre>`;
          }
          if (!(!text && errorText)) {
            outputHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(text) || '(empty)'}</pre>`;
          }
          var logHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(exportOptions.runCommandStr || exportOptions.args || exportOptions.command) || '(empty)'}</pre>`;
          dialogs.showDialog({
            leftAlign: true,
            title: jquery.localize.getString(
              commandFailed ? 'Run command after export failed' : 'Export Success!',
              'Panel',
            ),
            html: `<div>${jquery.localize.getString('Command Arguments:', 'Panel')}</div>${logHtml}<div>${jquery.localize.getString('Console Output:', 'Panel')}</div>${errorHtml}${outputHtml}`,
            buttons: saveDialog
              ? [revealLabel, jquery.localize.getString('Close')]
              : [jquery.localize.getString('Close')],
            callback: function (buttonIndex) {
              if (saveDialog && !buttonIndex) {
                JSBridge.showInFinder(outputPath);
              }
            },
          });
          dialogs.hideNotification();
        } else {
          !(function () {
            var notificationTitle = errorText
              ? 'Export operation succeeded with warnings.'
              : 'Export operation finished successfully.';
            notificationTitle = jquery.localize.getString(notificationTitle, 'Panel');
            if ('custom' == exportType) {
              if (exportOptions.showOutput) {
                notificationTitle = text.trim().split('\n').last() || notificationTitle;
              }
              if (!exportOptions.saveDialog) {
                revealLabel = void 0;
              }
            } else {
              if (exportOptions.runCommand) {
                notificationTitle = text.trim().split('\n').last() || notificationTitle;
              }
            }
            var notificationDetail = [
              errorText || '',
              'custom' == exportType && commandArguments
                ? jquery.localize.getString('Command Arguments:', 'Panel') +
                  ' ' +
                  commandArguments.join('')
                : '',
            ]
              .join('\n----------\n')
              .replace(/^\n\-+\n/, '');
            dialogs.showNotificationWithTitle(
              notificationTitle,
              notificationDetail,
              revealLabel,
              function () {
                JSBridge.showInFinder(outputPath);
              },
              { checkFocus: true },
            );
          })();
        }
        if (exportOptions.openExportLocation) {
          JSBridge.showInFinder(outputPath);
          if (!errorText) {
            setTimeout(dialogs.hideNotification, 2e3);
          }
        }
        if (exportOptions.openExportFile) {
          JSBridge.openFile(outputPath);
          if (!errorText) {
            setTimeout(dialogs.hideNotification, 2e3);
          }
        }
        if (File.isMac) {
          File.editor.export.cleanUpTempFiles();
        }
      },
      'name',
      { value: 'w', configurable: true },
    ),
    processExportVariables = Object.defineProperty(
      function (text, exportVariables, variableOverrides, quoteArguments, missingValue) {
        Object.defineProperty(normalizeVariableValue, 'name', { value: 's', configurable: true });
        Object.defineProperty(firstDefinedValue, 'name', { value: 'l', configurable: true });

        exportVariables = exportVariables || {};
        variableOverrides = variableOverrides || {};
        var outputPath = exportVariables.outputPath || variableOverrides.outputPath || '';
        function normalizeVariableValue(inputText) {
          if ('string' == typeof inputText) {
            if ('unset' == inputText) {
              return '';
            } else {
              return inputText.replace(/\n(.|\n\r)+/g, '');
            }
          } else {
            if (inputText instanceof Array) {
              return inputText.join(', ');
            } else {
              if (void 0 === inputText || null === inputText) {
                return inputText;
              } else {
                return inputText + '';
              }
            }
          }
        }
        function firstDefinedValue(...values) {
          for (var value of values) {
            if (void 0 !== value) {
              return value;
            }
          }
        }
        return text
          .replace(/\${([^\r\n}]+)}/gi, function (unusedParameter1, variableName) {
            var normalizedText = (variableName || '').toLowerCase();
            if ('today' == normalizedText) {
              return new Date().toISOString().substring(0, 10);
            }
            if ('outputpath' == normalizedText) {
              return outputPath;
            }
            if ('outputfolder' == normalizedText || 'outputfolderpath' == normalizedText) {
              return utilities.pathByDeleteLastComponent(outputPath);
            }
            if ('outputfoldername' == normalizedText) {
              return utilities.getFolder(outputPath);
            }
            if ('outputfilename' == normalizedText) {
              return fileIntegration.getFileNameFromPath(outputPath).replace(/\..+$/, '');
            }
            if ('outputfilefullname' == normalizedText) {
              return fileIntegration.getFileNameFromPath(outputPath);
            }
            if ('currentpath' == normalizedText) {
              return File.bundle.filePath || '';
            }
            if ('currentfolder' == normalizedText) {
              return fileIntegration.getCurrentFileFolderPath() || '';
            }
            if ('currentfilename' == normalizedText) {
              return fileIntegration
                .getFileNameFromPath(File.bundle.filePath || '')
                .replace(/\..+$/, '');
            }
            if ('currentfilefullname' == normalizedText) {
              return fileIntegration.getFileNameFromPath(File.bundle.filePath || '');
            }
            if ('openedFolder' == normalizedText) {
              return File.getMountFolder();
            }
            var localSettingBridge = File.editor.localSettingBridge,
              resolvedValue = normalizeVariableValue(
                firstDefinedValue(
                  variableOverrides[variableName],
                  variableOverrides[normalizedText],
                  localSettingBridge.getSetting(variableName),
                  localSettingBridge.getSetting(normalizedText),
                  exportVariables[variableName],
                  exportVariables[normalizedText],
                ),
              );
            if (void 0 == resolvedValue && normalizedText.indexOf('.') > 0) {
              let parts = normalizedText.split(/\./);
              var nestedValue;
              for (var currentText of parts) {
                if (
                  !(nestedValue = nestedValue
                    ? nestedValue[currentText]
                    : localSettingBridge.getSetting(currentText) ||
                      localSettingBridge.getSetting(currentText.toLowerCase()))
                ) {
                  break;
                }
              }
              if (void 0 != nestedValue) {
                return (function (inputText) {
                  if (quoteArguments && /['";&|><\s]/.exec(inputText)) {
                    return '' + inputText.replace(/['"]/g, '') + '';
                  } else {
                    return inputText;
                  }
                })(normalizeVariableValue(nestedValue));
              }
            }
            return firstDefinedValue(resolvedValue, missingValue, '${' + variableName + '}');
          })
          .replace(/(['"])(.*?)\1/g, function (unusedParameter1, quoteCharacter, inputText) {
            return quoteCharacter + inputText.replace(/\uE033|\uE034/g, '') + quoteCharacter;
          })
          .replace(/\uE033(.*?)\uE034/g, function (unusedParameter1, quotedValue) {
            return '"' + quotedValue + '"';
          });
      },
      'name',
      { value: 'x', configurable: true },
    );
  const renderHeaderFooterSpan = Object.defineProperty(
    (text, exportOptions) => {
      if (
        text &&
        (text = printAndImageExport.renderHeaderFooterText(
          text,
          exportOptions,
          '${pageNo}',
          '${totalPages}',
        )).trim().length
      ) {
        var SPANElement = document.createElement('SPAN');
        SPANElement.textContent = text;
        SPANElement.style.color = jquery('p').css('color');
        SPANElement.style.fontFamily = '-apple-system';
        SPANElement.style.fontSize = '6pt';
        return SPANElement.outerHTML;
      }
    },
    'name',
    { value: 'C', configurable: true },
  );
  class ExportController {
    constructor(editor) {
      this.editor = editor;
      this.processExportVariables = processExportVariables;
      this.onExportSuccess = handleExportSuccess;
      this.registerBridge();
    }
    recordLastExport(exportOptions, path) {
      delete exportOptions.overwrite;
      delete exportOptions.path;
      var lastExport = Object.assign({ path: path }, exportOptions);
      JSBridge.invoke('export.recordLastExport', lastExport);
      File.option.lastExport = lastExport;
      File.option.lastExportNoOverwrite = false;
    }
    registerBridge() {
      if (File.isMac) {
        var receiver = this;
        bridge.registerHandler('export.exportToNative', function (request, respond) {
          receiver.exportToNative(
            request.target,
            function (native, option) {
              respond({ native: native, option: option });
            },
            request.folder,
            request.option,
          );
        });
        bridge.registerHandler('export.onExportSuccess', function (result, respond) {
          handleExportSuccess(
            result.type,
            result.path,
            result.option,
            result.message,
            result.error,
            result.args,
          );
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler(
          'export.onExportCanceled',
          function (unusedParameter1, unusedParameter2) {
            dialogs.hideNotification();
          },
        );
        bridge.registerHandler('export.onExportFailed', function (errorDetails, respond) {
          var DIVElement = document.createElement('DIV');
          DIVElement.innerHTML = jquery.localize
            .getString('Failed to export file to <em>{0}</em>', 'Panel')
            .format(
              errorDetails.path
                ? utilities.escape(errorDetails.path)
                : jquery.localize.getString('Export Failed', 'Panel'),
            );
          dialogs.hideNotification();
          dialogs.showErrorDialog(DIVElement.textContent, utilities.escape(errorDetails.error));
          console.sendError(errorDetails.error, 'warning');
          if (respond) {
            respond();
          }
        });
        bridge.registerHandler('export.dataForExport', async function (exportOptions, respond) {
          receiver.showExportNotification(true);
          setTimeout(
            function () {
              setTimeout(
                async function () {
                  if (exportOptions.forImage) {
                    exportOptions = Object.assign({ fontSize: '24px', width: 640 }, exportOptions);
                  }
                  var documentText = jquery('[cid]').text(),
                    hasNonAlphabet = !!/[\u4E00-\u9FCC]{4}/.exec(documentText);
                  respond({
                    suggestedFilename: File.getSuggestedFileName() || '',
                    content: await receiver.exportToHTML(exportOptions || {}),
                    pdfHeader: renderHeaderFooterSpan(exportOptions.header, exportOptions),
                    pdfFooter: renderHeaderFooterSpan(exportOptions.footer, exportOptions),
                    hasNonAlphabet: hasNonAlphabet,
                  });
                },
                receiver.beforeExport(exportOptions.forPrint) ? 1e3 : 0,
              );
              receiver.showExportNotification(true);
            },
            File.isMac ? 50 : 0,
          );
        });
        bridge.registerHandler('export.exportToHTML', function (exportOptions, respond) {
          receiver.showExportNotification(true);
          setTimeout(
            async function () {
              File.sync();
              var exportedHtml = await receiver.exportToHTML(exportOptions);
              respond(exportedHtml);
            },
            File.isMac ? 400 : 0,
          );
        });
        bridge.registerHandler('export.exportWithCommand', async function (exportOptions, respond) {
          var commandResult = await receiver.exportWithCommand(exportOptions);
          if (!exportOptions.path) {
            exportOptions.path = exportOptions.output;
          }
          respond(commandResult);
        });
        bridge.registerHandler('pdf.getFixData', function (exportOptions, respond) {
          exportOptions = exportOptions || {};
          try {
            exportOptions[':headers:'] = receiver.editor.library.outline.getHeaderMatrix(true);
            var calculatedSettings = receiver.editor.localSettingBridge.getCalculatedSetting();
            exportOptions = Object.assign(exportOptions, calculatedSettings);
          } catch (error) {
            console.sendError(error);
          }
          respond(exportOptions);
        });
        bridge.registerHandler('export.prepare', function (exportOptions, respond) {
          File.editor.EditHelper.hideNotification();
          respond((exportOptions = File.editor.localSettingBridge.loadExportOption(exportOptions)));
        });
      }
    }
    beforeExport(restoreSourceMode) {
      if (File.editor.sourceView.inSourceMode) {
        File.editor.sourceView.hide();
        File.editor.library.recoverSidebar();
        if (File.isMac) {
          bridge.callHandler('window.updateUIAfterExitSourceMode');
        }
      } else {
        File.editor.store(true);
        restoreSourceMode = false;
      }
      File.sync();
      File.editor.nodeMap.toc.updateHTML();
      if (File.megaMenu) {
        File.megaMenu.hide();
      }
      document.body.classList.remove('marklyra-show-notification');
      return restoreSourceMode;
    }
    showExportNotification(disableAnimation) {
      dialogs.showProcessingNotification('Exporting in progress...', disableAnimation);
    }
    exportToNative(exportType, onExported, folder, exportOptions) {
      onExported = onExported || function () {};
      exportOptions = exportOptions || {};
      var target =
        'pandoc' == exportType || 'native' == exportType
          ? exportOptions.raw || exportOptions.targetFormat
          : exportType;
      if ('latex-pdf' == target) {
        target = 'latex';
      } else {
        if ('mediawiki' == target) {
          target = 'wiki';
        }
      }
      var nativeOptions = Object.assign(
        { cwd: fileIntegration.getCurrentFileFolderPath() },
        exportOptions,
        {
          target: target,
          folder: folder,
        },
      );
      if (File.isMac && exportOptions.extraArguments) {
        nativeOptions.extraArguments = exportOptions.extraArguments.map((item) =>
          File.editor.export.processExportVariables(item, { outputPath: exportOptions.path }),
        );
      }
      return this.editor.nodeMap.exportToNative(
        target,
        function (nativeContent) {
          onExported(nativeContent, nativeOptions);
        },
        folder,
        Object.assign({}, nativeOptions),
      );
    }
    exportToImage(exportOptions) {
      printAndImageExport.exportToImage(exportOptions);
    }
    async exportAndSaveHTML(exportOptions) {
      var outputPath = await fileIntegration.showExportDialog('html', exportOptions);
      if (outputPath) {
        this.recordLastExport(exportOptions, outputPath);
        var exportedHtml = await this.exportToHTML(exportOptions);
        File.fs.writeFile(outputPath, exportedHtml, (error) => {
          if (error) {
            dialogs.showDialog({
              title: jquery.localize.getString('Error'),
              html:
                jquery.localize
                  .getString('Failed to export file to <em>{0}</em>', 'Panel')
                  .format(utilities.escape(outputPath)) +
                '<br/>' +
                utilities.escape(error.message),
              backdrop: 'static',
              type: 'error',
            });
            console.sendError(error, 'warn');
          } else {
            handleExportSuccess('html', outputPath, exportOptions);
          }
        });
      }
    }
    exportCollection(collection, footnotes, exportOptions) {
      Object.defineProperty(renderChildrenForExport, 'name', { value: '_', configurable: true });
      Object.defineProperty(renderTableOfContents, 'name', { value: 'M', configurable: true });
      Object.defineProperty(renderExportBlock, 'name', { value: 'L', configurable: true });

      var currentText = exportOptions || {},
        forPrint = currentText.forPrint,
        noStyle = currentText.noStyle,
        exportFooter = currentText.exportFooter,
        exportInline = currentText.exportInline,
        forImage = currentText.forImage,
        anchorMap = currentText.anchorMap || {},
        anchorList = currentText.anchorList || dialogs.fetchAnchorList(anchorMap, noStyle);
      currentText.anchorList = anchorList;
      currentText.anchorMap = anchorMap;
      var documentMap = this.editor.nodeMap,
        editor = this.editor,
        localText =
          ((exportInline =
            exportInline ||
            new markdownParser.InlineLexer(
              {
                nodeMap: documentMap,
                count: 1,
                footnoteList: [],
                appendFootnote: function (documentNode, skipFootnote) {
                  if (!footnotes[skipFootnote]) {
                    footnotes[skipFootnote] = [''];
                    var footnoteHtml = exportInline.output(
                      documentNode.get('text'),
                      inlineDecoration.decorateAsExport,
                      false,
                      {
                        parent: documentNode,
                        skipFootnote: skipFootnote,
                      },
                    );
                    footnotes[skipFootnote][0] =
                      "<span class='md-fn-count'>" + skipFootnote + '</span> ' + footnoteHtml;
                  }
                  var referenceIndex = footnotes[skipFootnote].length - 1,
                    referenceId = skipFootnote + (referenceIndex ? '-' + referenceIndex : '');
                  footnotes[skipFootnote].push(
                    " <a name='dfref-footnote-" +
                      referenceId +
                      "' href='#ref-footnote-" +
                      referenceId +
                      "' title='" +
                      jquery.localize.getString('back to document') +
                      "' class='reversefootnote' >↩</a>",
                  );
                  return referenceId;
                },
                noStyle: noStyle,
                forPrint: forPrint,
                forExport: true,
                anchorList: anchorList,
                skipOp: { atag: true, underline: true, comment: true, imgtag: true },
              },
              inlineDecoration.decorateAsExport,
            )),
          ''),
        blockSeparator =
          void 0 === currentText.split || null === currentText.split
            ? noStyle
              ? '\n'
              : ''
            : currentText.split,
        receiver = this;
      function renderChildrenForExport(documentNode, renderState) {
        if ('string' == typeof documentNode) {
          return exportInline.output(documentNode, inlineDecoration.decorateAsExport);
        }
        var children = documentNode.get('children');
        if (currentDocumentNode.canContainBlock(documentNode.get('type'))) {
          if (children && children.length > 0) {
            currentText.exportFooter = false;
            return receiver.exportCollection(children, footnotes, currentText);
          } else {
            return exportInline.output(documentNode.get('text'), inlineDecoration.decorateAsExport);
          }
        }
        var parentNode = documentNode.get('parent'),
          inlineOptions = {};
        if (
          currentDocumentNode.isType(documentNode, NodeType.paragraph) &&
          !documentNode.get('before') &&
          currentDocumentNode.isType(parentNode, NodeType.blockquote) &&
          parentNode.get('alert')
        ) {
          inlineOptions.alert = true;
        }
        return exportInline.output(
          documentNode.get('text'),
          inlineDecoration.decorateAsExport,
          void 0,
          inlineOptions,
          renderState,
        );
      }
      currentText.exportInline = exportInline;
      footnotes = footnotes || [];
      var tocHtml = null;
      function renderTableOfContents() {
        if (noStyle) {
          return '<div>[TOC]</div>';
        }
        if (!tocHtml) {
          var tocElement = jquery(document.querySelector('.md-toc-content')).clone();
          if (!tocElement[0]) {
            return '';
          }
          tocElement.find('[data-ref]').each(function () {
            if (forPrint) {
              this.querySelector('a').setAttribute(
                'href',
                (File.isMac ? 'at://' : '#header-') + this.getAttribute('data-ref'),
              );
            } else {
              this.querySelector('a').setAttribute(
                'href',
                '#' + anchorMap[this.getAttribute('data-ref')],
              );
            }
          });
          tocElement.find('.md-meta').remove();
          tocHtml = "<div class='md-toc' mdtype='toc'>" + tocElement[0].outerHTML + '</div>';
        }
        return tocHtml;
      }
      function renderExportBlock(documentNode) {
        Object.defineProperty(findHeadingIndex, 'name', { value: 't', configurable: true });

        function findHeadingIndex(nodeId) {
          if (nodeId) {
            return documentMap.toc.headers.findIndex(function (item) {
              return item.cid == nodeId;
            });
          } else {
            return -1;
          }
        }
        var renderState = { cid: documentNode.cid };
        switch (documentNode.get('type')) {
          case NodeType.paragraph:
            if (-1 == documentNode.get('text').indexOf('\n')) {
              var parsedNode = currentDocumentNode.parseFrom(
                documentNode.getText(),
                null,
                { noTop: true, skips: { fromP: true, old_code: false } },
                true,
              )[1][0];
              if (
                currentDocumentNode.isType(parsedNode, NodeType.heading) &&
                ((parsedNode.cid = documentNode.cid),
                -1 == findHeadingIndex(parsedNode.cid) && documentNode.isTopBlock())
              ) {
                var precedingHeadingId = editor
                  .findElemById(parsedNode.cid)
                  .prevAll('.md-heading')
                  .first()
                  .attr('cid');
                documentMap.toc.headers.splice(
                  findHeadingIndex(precedingHeadingId) + 1,
                  0,
                  parsedNode,
                );
              }
              if (
                currentDocumentNode.isType(
                  parsedNode,
                  NodeType.heading,
                  NodeType.def_footnote,
                  NodeType.def_link,
                )
              ) {
                parsedNode.cid = documentNode.cid;
                return renderExportBlock(parsedNode);
              }
            }
            var inlineHtml = renderChildrenForExport(documentNode, renderState);
            if ('' == inlineHtml || renderState.hasContent) {
              if (
                !currentText.noStyle &&
                (function (htmlContent) {
                  if (/^\s*<img /.exec(htmlContent || '')) {
                    var sanitizedFragment = DOMPurify.sanitize(
                      htmlContent,
                      htmlBlocks.getDomPurifyConfig(htmlBlocks.INLINE_CONFIG),
                    );
                    if (
                      1 == sanitizedFragment.childNodes.length &&
                      1 === sanitizedFragment.children.length
                    ) {
                      var element = sanitizedFragment.children[0];
                      return !(!element.style.float && !element.getAttribute('align'));
                    }
                    return false;
                  }
                  return false;
                })(inlineHtml)
              ) {
                return "<p><span class='md-image'>" + inlineHtml + '</span></p>';
              } else {
                return '<p>' + (inlineHtml || '&nbsp;') + '</p>';
              }
            } else {
              return inlineHtml;
            }
          case NodeType.heading:
            var pageBreakAttribute = '';
            if (
              forPrint &&
              1 == documentNode.get('depth') &&
              !documentNode.get('parent') &&
              documentNode.get('before')
            ) {
              pageBreakAttribute = ' data-breakpage';
            }
            var currentElement = null,
              attributeValue = '';
            if (forPrint) {
              currentElement = document.createElement('a');
              attributeValue = 'header-' + documentNode.cid;
              currentElement.setAttribute('name', attributeValue);
              currentElement.setAttribute('class', 'md-header-anchor md-print-anchor');
              currentElement.setAttribute('href', 'af://' + documentNode.cid);
              currentElement.innerText = ' ';
            } else {
              attributeValue = anchorMap[documentNode.cid];
            }
            return `<h${documentNode.get('depth')}${pageBreakAttribute}${currentElement || !attributeValue ? '' : " id='" + utilities.escapeInQuote(attributeValue) + "'"}>${currentElement ? currentElement.outerHTML : ''}${renderChildrenForExport(documentNode, renderState)}</h${documentNode.get('depth')}>`;
          case NodeType.blockquote:
            let alert = documentNode.get('alert');
            if (
              currentDocumentNode.isType(alert, 'note', 'warning', 'important', 'tip', 'caution')
            ) {
              return (
                `<div class="md-alert md-alert-${alert} ${alert}">` +
                renderChildrenForExport(documentNode, renderState) +
                '</div>'
              );
            } else {
              return (
                '<blockquote>' +
                renderChildrenForExport(documentNode, renderState) +
                '</blockquote>'
              );
            }
          case NodeType.list:
            var style = documentNode.get('style'),
              isLooseList = (function () {
                for (
                  var listItems = documentNode.get('children').toArray(), itemIndex = 0;
                  itemIndex < listItems.length;
                  itemIndex++
                ) {
                  var localDocumentNode = listItems[itemIndex].getFirstChild();
                  if (
                    !currentDocumentNode.isType(localDocumentNode, NodeType.paragraph) ||
                    localDocumentNode.get('after')
                  ) {
                    return true;
                  }
                }
                return false;
              })();
            documentNode.set('loose', isLooseList);
            var startAttribute = '';
            if (style == currentDocumentNode.ListType.ol) {
              startAttribute =
                '' === documentNode.get('start') ? void 0 : documentNode.get('start') - 0;
              startAttribute =
                Number.isNaN(startAttribute) || 1 == startAttribute
                  ? ''
                  : " start='" + documentNode.get('start') + "' ";
            }
            return (
              '<' +
              style +
              startAttribute +
              '>' +
              blockSeparator +
              renderChildrenForExport(documentNode, renderState) +
              blockSeparator +
              '</' +
              style +
              '>'
            );
          case NodeType.list_item:
            if (documentNode.get('style') === currentDocumentNode.ListType.task) {
              return (
                '<li' +
                (noStyle
                  ? ''
                  : " class='md-task-list-item task-list-item task-list-" +
                    (documentNode.get('checked') ? 'done' : 'not-done') +
                    "' ") +
                "><input type='checkbox' " +
                (documentNode.get('checked') ? 'checked' : '') +
                '/>' +
                renderChildrenForExport(documentNode, renderState) +
                '</li>'
              );
            } else {
              return (
                '<li>' +
                (function (inputDocumentNode, renderState) {
                  if (noStyle && false === inputDocumentNode.get('parent').get('loose')) {
                    return renderChildrenForExport(inputDocumentNode.getFirstChild(), renderState);
                  } else {
                    return renderChildrenForExport(inputDocumentNode, renderState);
                  }
                })(documentNode, renderState) +
                '</li>'
              );
            }
          case NodeType.fences:
            var language = documentNode.get('lang') || '';
            if (noStyle) {
              if (language) {
                return (
                  '<pre' +
                  markdownParser.attrToString(markdownParser.parsePandocAttr(language)) +
                  "><code class='language-" +
                  (language = utilities.escapeInQuote(getCodeMirrorMode(language, false, true))) +
                  "' lang='" +
                  language +
                  "'>" +
                  utilities.escape(documentNode.get('text')) +
                  blockSeparator +
                  '</code></pre>'
                );
              } else {
                return (
                  '<pre><code>' +
                  utilities.escape(documentNode.get('text')) +
                  blockSeparator +
                  '</code></pre>'
                );
              }
            }
            var showLineNumbers,
              renderedElement = editor.findElemById(documentNode.id).clone();
            if (diagrams.isDiagramType(language)) {
              showLineNumbers = false;
              var elements = editor.findElemById(documentNode.id).find('svg');
              if (currentText.mermaidSVGs && currentText.mermaidSVGs[documentNode.id]) {
                renderedElement.find('svg').replaceWith(currentText.mermaidSVGs[documentNode.id]);
              }
              var currentElements = renderedElement.find('svg');
              if (
                !elements.attr('width') ||
                elements.attr('viewBox') ||
                /%/.exec(elements.attr('width'))
              ) {
                if (elements.attr('max-width')) {
                  currentElements.css('width', elements.attr('max-width'));
                  currentElements.css('max-width', '');
                }
              } else {
                currentElements.attr(
                  'viewBox',
                  '0 0 ' + elements.attr('width') + ' ' + elements.height(),
                );
                currentElements.css('max-width', '100%');
                currentElements.css('height', 'auto');
              }
              var diagramElement = renderedElement
                .find('.md-diagram-panel')
                .attr('lang', language)
                .html(renderedElement.find('.md-diagram-panel-preview').html())[0];
              if (diagramElement) {
                return mediaActions.processExportedSVG(diagramElement.outerHTML, true);
              } else {
                return '';
              }
            }
            if (mathBlocks.isMathType(documentNode.get('lang'))) {
              if ('latex' == File.option.mathFormatOnCopy) {
                return "<pre lang='math'><code>%@</code></pre>".replace(
                  '%@',
                  utilities.escape(documentNode.get('text')),
                );
              } else {
                return receiver.getSVGForExport(
                  documentNode,
                  forImage,
                  !currentText.forPrint && !currentText.forImage && !currentText.noStyle,
                );
              }
            }
            if (false !== showLineNumbers) {
              showLineNumbers = documentNode.get('text').split(/\n/).length > 13;
            }
            var localElement = document.querySelector('.md-fences .CodeMirror-linenumber');
            if (!currentText.fenceLineFontSize && localElement && forImage) {
              currentText.fenceLineFontSize = window.getComputedStyle(localElement).fontSize;
              let codeLine = document.querySelector('.md-fences .CodeMirror-line');
              if (codeLine && currentText.fontSize) {
                if ('number' == typeof currentText.fontSize) {
                  codeLine.style.fontSize = `${currentText.fontSize}px`;
                } else {
                  codeLine.style.fontSize = currentText.fontSize;
                }
                currentText.lineNumberLineHeightStyle =
                  window.getComputedStyle(codeLine).lineHeight;
                currentText.lineNumberLineHeightStyle = `line-height:${currentText.lineNumberLineHeightStyle};`;
                codeLine.style.fontSize = '';
              }
            }
            if (renderedElement.children('.CodeMirror').length) {
              renderedElement
                .removeAttr('cid')
                .removeAttr('contenteditable')
                .removeAttr('mdtype')
                .html(renderedElement.children('.CodeMirror')[0].outerHTML)
                .find(
                  '.CodeMirror-cursors, .CodeMirror-hscrollbar, .CodeMirror-vscrollbar, .CodeMirror-selected',
                )
                .remove()
                .end()
                .find('.CodeMirror-sizer')
                .css('min-height', '')
                .end()
                .find('.CodeMirror-selectedtext')
                .removeClass('CodeMirror-selectedtext')
                .end()
                .find('[cm-zwsp]')
                .text('\n');
              if (currentText.fenceLineFontSize) {
                renderedElement
                  .find('.CodeMirror-linenumber')
                  .each(function () {
                    if (currentText.fenceLineFontSize) {
                      this.setAttribute(
                        'style',
                        this.getAttribute('style') +
                          ';font-size:' +
                          currentText.fenceLineFontSize +
                          ' !important;' +
                          (currentText.lineNumberLineHeightStyle || ''),
                      );
                    }
                  })
                  .end()
                  .find('.CodeMirror-gutters')
                  .css('height', '100%');
              }
            }
            if (forPrint && File.option.noLineWrapping) {
              renderedElement
                .children('.CodeMirror')
                .addClass('CodeMirror-wrap')
                .find('.CodeMirror-sizer')
                .css('min-width', '');
            }
            if (showLineNumbers) {
              renderedElement.css('page-break-inside', 'unset');
            }
            if (forPrint && File.isNode) {
              var fontFamily =
                window.getComputedStyle(File.editor.writingArea).fontFamily || 'initial';
              fontFamily = fontFamily.replace(/'/g, "\\'");
              renderedElement.find('.CodeMirror-line > span').each(function () {
                !Object.defineProperty(
                  function wrapFontSensitiveCharacters(domNode, fontFamily) {
                    if (domNode.nodeType == document.TEXT_NODE) {
                      var text = domNode.textContent;
                      if (
                        (text = text
                          .split(/(;|-)/)
                          .map(function (item) {
                            if (';' == item || '-' == item) {
                              return (
                                "<span style='font-family:" + fontFamily + "'>" + item + '</span>'
                              );
                            } else {
                              return utilities.escape(item);
                            }
                          })
                          .join('')) != domNode.textContent
                      ) {
                        domNode.innerHTML = text;
                      }
                    } else {
                      if (1 == domNode.nodeType) {
                        domNode.childNodes.forEach(function (item) {
                          wrapFontSensitiveCharacters(item, fontFamily);
                        });
                      }
                    }
                  },
                  'name',
                  { value: 'e', configurable: true },
                )(this, fontFamily);
              });
            }
            return renderedElement[0].outerHTML.trim();
          case NodeType.html_block:
            return htmlBlocks.buildHTMLForExport(
              documentNode.get('text'),
              editor,
              forPrint,
              documentNode,
            );
          case NodeType.math_block:
            if (currentText.noStyle && 'latex' == File.option.mathFormatOnCopy) {
              return '<div>$$\n%@\n$$</div>'.replace(
                '%@',
                utilities.escape(documentNode.get('text')),
              );
            } else {
              return receiver.getSVGForExport(
                documentNode,
                forImage,
                !currentText.forPrint && !currentText.forImage && !currentText.noStyle,
              );
            }
          case NodeType.hr:
            return '<hr />';
          case NodeType.def_footnote:
          case NodeType.def_link:
            return '';
          case NodeType.table:
            for (
              var tableHtml = "<figure class='table-figure'><table>" + blockSeparator,
                tableChild = documentNode.getFirstChild();
              tableChild;
            ) {
              if (tableChild.get('before')) {
                tableHtml += renderExportBlock(tableChild);
              } else {
                tableHtml +=
                  '<thead>' +
                  blockSeparator +
                  renderExportBlock(tableChild) +
                  '</thead>' +
                  blockSeparator +
                  '<tbody>';
              }
              if (!(tableChild = tableChild.get('after'))) {
                tableHtml += '</tbody>' + blockSeparator;
              }
            }
            return (tableHtml += '</table></figure>');
          case NodeType.table_row:
            tableHtml = '<tr>';
            tableChild = documentNode.getFirstChild();
            for (
              var alignmentAttribute,
                alignment = documentNode.get('parent').get('align'),
                currentItemIndex = 0,
                cellTag = documentNode.get('before') ? 'td' : 'th';
              tableChild;
            ) {
              tableHtml +=
                '<' +
                cellTag +
                (alignmentAttribute = (alignmentAttribute = alignment[currentItemIndex])
                  ? " style='text-align:" + alignmentAttribute + ";' "
                  : '') +
                '>' +
                renderExportBlock(tableChild) +
                '</' +
                cellTag +
                '>';
              tableChild = tableChild.get('after');
              currentItemIndex++;
            }
            return (tableHtml += '</tr>');
          case NodeType.table_cell:
            return renderChildrenForExport(documentNode, renderState) || '&nbsp;';
          case NodeType.meta_block:
            return '';
          case NodeType.toc:
            return '';
          default:
            return '<p>' + renderChildrenForExport(documentNode, renderState) + '</p>';
        }
      }
      if ('string' == typeof collection) {
        return renderChildrenForExport(collection);
      }
      if (collection.length) {
        var isArray = collection instanceof Array,
          currentNode = isArray ? collection[0] : collection.sortedFirst();
        do {
          localText += renderExportBlock(currentNode) + blockSeparator;
          currentNode = currentNode.get('after');
        } while (currentNode && (!isArray || collection.indexOf(currentNode) > -1));
      }
      return (
        (localText = localText.replaceAll
          ? localText.replaceAll('', function () {
              return renderTableOfContents();
            })
          : localText.replace(/\uE088/g, function () {
              return renderTableOfContents();
            })) + (exportFooter ? renderFootnoteLines(footnotes) : '')
      );
    }
    getSVGForExport(documentNode, svgOnly, keepAssistiveMath) {
      var editor = this.editor,
        mathElement = editor.findElemById(documentNode.refcid || documentNode.id).clone(),
        elements = mathElement.find('svg');
      if (!keepAssistiveMath) {
        mathElement.find('mjx-assistive-mml').remove();
      }
      if (!elements.length && documentNode.refcid) {
        documentNode.refcid = void 0;
        elements = (mathElement = editor.findElemById(documentNode.id)).find('svg');
      }
      var mathDomNode,
        mathContainers = mathElement.find('mjx-container').clone();
      if (svgOnly) {
        if (mathContainers[0]) {
          return mediaActions.processExportedSVG(mathContainers[0].outerHTML, true);
        } else {
          return (
            "<p class='md-math-block'>$$" + utilities.escape(documentNode.get('text')) + '$$</p>'
          );
        }
      } else {
        if (mathContainers.length) {
          mathElement = mathElement.clone();
          (mathElement = jquery(
            jquery.parseHTML(
              mathElement
                .html('')[0]
                .outerHTML.replace(/<pre/, '<div')
                .replace(/<\/pre>/, '</div>'),
            ),
          )).append(mathContainers);
          mathContainers.wrap("<div class='md-math-container'></div>");
          return mediaActions.processExportedSVG(
            ((mathDomNode = mathElement[0]),
            (mathDomNode.innerHTML = mathDomNode.innerHTML.trim()),
            (mathDomNode.children[0].innerHTML = mathDomNode.children[0].innerHTML.trim()),
            mathDomNode).outerHTML,
            true,
          );
        } else {
          return "<p class='md-math-block'>{math}</p>".replace(
            '{math}',
            '$$\n' + utilities.escape(documentNode.get('text')) + '\n$$',
          );
        }
      }
    }
    async exportToHTML(exportOptions) {
      Object.defineProperty(appendInlineStylesheet, 'name', { value: 'v', configurable: true });
      Object.defineProperty(appendStylesheetLink, 'name', { value: 'w', configurable: true });
      Object.defineProperty(valueOrFallback, 'name', { value: 'F', configurable: true });
      Object.defineProperty(readStylesheetText, 'name', { value: 'k', configurable: true });
      Object.defineProperty(getThemeFileUrl, 'name', { value: 'T', configurable: true });
      Object.defineProperty(createOutlineNavigationScript, 'name', {
        value: '_',
        configurable: true,
      });
      Object.defineProperty(parseExportHeadContent, 'name', { value: 'A', configurable: true });
      Object.defineProperty(collectExportStyleIncludes, 'name', { value: 'M', configurable: true });
      Object.defineProperty(resolveExportResourceUrl, 'name', { value: 'L', configurable: true });

      var forPrint = (exportOptions = exportOptions || {}).forPrint,
        noStyle = exportOptions.noStyle,
        noBackground = exportOptions.noBackground,
        forImage = exportOptions.forImage,
        extraCss = exportOptions.extraCss,
        themeCss = '',
        documentMap = this.editor.nodeMap,
        editor = this.editor,
        footnotes = [],
        documentTitle =
          File.editor.docMenu.getValueInMeta('title') ||
          (File.getFileName() || '').replace(/\.(md|mmd|markdown|txt|text|mdwn)$/i, ''),
        hasMermaid = File.option.enableDiagram && jquery(".md-fences[lang='mermaid']").length,
        hasZenUml = hasMermaid && jquery(".md-fences[mermaid-type='zenuml']").length,
        hasCodeBlocks = hasMermaid || jquery('.md-fences').length,
        textParts = [];
      function appendInlineStylesheet(cssText, styleId, outputParts) {
        if (!cssText) {
          return '';
        }
        (outputParts || textParts).push(
          `<style type='text/css' ${styleId ? ` id="style-${styleId}"` : ''}>${cssText}</style>`,
        );
      }
      function appendStylesheetLink(stylesheetUrl, outputParts) {
        if (!stylesheetUrl) {
          return '';
        }
        (outputParts || textParts).push(
          "<link rel='stylesheet' href='" +
            utilities.escapeForPreWrap(stylesheetUrl) +
            "' type='text/css' />",
        );
      }
      if (!noStyle) {
        if (editor.mathBlock.currentCm && editor.mathBlock.currentCm.cid) {
          await editor.mathBlock.stopEditing(editor.mathBlock.currentCm.cid);
        }
        editor.fences.decorateAll();
      }
      if ('latex' != File.option.mathFormatOnCopy) {
        await editor.mathInline.renderAll(false, editor.writingArea, false, true);
      }
      if (File.option.showLineNumbersForFence) {
        editor.fences.refreshEditor(true);
      }
      var collectionOptions = {
        forPrint: forPrint,
        noStyle: noStyle,
        forImage: forImage,
        fontSize: exportOptions.fontSize,
        anchorMap: {},
      };
      function valueOrFallback(value, fallbackValue) {
        if (void 0 === value || null === value || '' === value) {
          return fallbackValue;
        } else {
          return value;
        }
      }
      function readStylesheetText(filePath) {
        if (File.isMac) {
          return bridge.callSync('path.readText', filePath);
        }
        if (File.isNode) {
          try {
            return reqnode('fs').readFileSync(filePath, 'utf-8');
          } catch (error) {}
          return '';
        }
      }
      var importCount = 0;
      function getThemeFileUrl(themeFilename) {
        return (
          'file://' +
          (File.isNode
            ? window._options.userDataPath + '/themes/' + themeFilename
            : _options.currentThemeFolder + '/' + themeFilename)
        );
      }
      function createOutlineNavigationScript() {
        return `\n<script>(${function () {
          Object.defineProperty(getScrollTop, 'name', { value: 'o', configurable: true });

          var parentElement = document.body.parentElement,
            items = [],
            activeHeading = null,
            collapseOutline = document.body.classList.contains('marklyra-export-collapse-outline'),
            delegateEvent = Object.defineProperty(
              function (eventType, selector, listener) {
                document.addEventListener(
                  eventType,
                  function (event) {
                    if (!event.defaultPrevented) {
                      for (
                        var domNode = event.target;
                        domNode && domNode != this;
                        domNode = domNode.parentNode
                      ) {
                        if (domNode.matches(selector)) {
                          if (false === listener.call(domNode, event)) {
                            event.preventDefault();
                            event.stopPropagation();
                          }
                          break;
                        }
                      }
                    }
                  },
                  false,
                );
              },
              'name',
              { value: 'r', configurable: true },
            );
          function getScrollTop() {
            return parentElement.scrollTop;
          }
          delegateEvent('click', '.outline-expander', function (unusedParameter1) {
            var classList = this.closest('.outline-item-wrapper').classList;
            if (classList.contains('outline-item-open')) {
              classList.remove('outline-item-open');
            } else {
              classList.add('outline-item-open');
            }
            updateActiveOutline();
            return false;
          });
          delegateEvent('click', '.outline-item', function (unusedParameter1) {
            var element = this.querySelector('.outline-label');
            location.hash = '#' + element.getAttribute('href');
            if (collapseOutline) {
              var classList = this.closest('.outline-item-wrapper').classList;
              if (!classList.contains('outline-item-open')) {
                classList.add('outline-item-open');
              }
              clearActiveOutline();
              classList.add('outline-item-active');
            }
          });
          var timerId,
            currentTimerId,
            findActiveHeading = Object.defineProperty(
              function () {
                var scrollPosition = getScrollTop();
                activeHeading = null;
                for (
                  var itemIndex = 0;
                  itemIndex < items.length && items[itemIndex][1] - scrollPosition < 60;
                  itemIndex++
                ) {
                  activeHeading = items[itemIndex];
                }
              },
              'name',
              { value: 'l', configurable: true },
            ),
            clearActiveOutline = Object.defineProperty(
              function () {
                document
                  .querySelectorAll('.outline-item-active')
                  .forEach((element) => element.classList.remove('outline-item-active'));
                document
                  .querySelectorAll('.outline-item-single.outline-item-open')
                  .forEach((element) => element.classList.remove('outline-item-open'));
              },
              'name',
              { value: 'c', configurable: true },
            ),
            updateActiveOutline = Object.defineProperty(
              function () {
                if (activeHeading) {
                  clearActiveOutline();
                  var element = document.querySelector(
                    '.outline-label[href="#' +
                      (CSS.escape ? CSS.escape(activeHeading[0]) : activeHeading[0]) +
                      '"]',
                  );
                  if (element) {
                    if (collapseOutline) {
                      var currentElement = element.closest(
                        '.outline-item-open>ul>.outline-item-wrapper',
                      );
                      if (currentElement) {
                        currentElement.classList.add('outline-item-active');
                      } else {
                        for (
                          var localElement = (element =
                            element.closest('.outline-item-wrapper')).parentElement.closest(
                            '.outline-item-wrapper',
                          );
                          localElement;
                        ) {
                          localElement = (element = localElement).parentElement.closest(
                            '.outline-item-wrapper',
                          );
                        }
                        element.classList.add('outline-item-active');
                      }
                    } else {
                      element.closest('.outline-item-wrapper').classList.add('outline-item-active');
                    }
                  }
                }
              },
              'name',
              { value: 'd', configurable: true },
            );
          window.addEventListener('scroll', function (unusedParameter1) {
            if (timerId) {
              clearTimeout(timerId);
            }
            timerId = setTimeout(function () {
              findActiveHeading();
              updateActiveOutline();
            }, 300);
          });
          var scheduleOutlineRefresh = Object.defineProperty(
            function () {
              currentTimerId = setTimeout(function () {
                !(function () {
                  items = [];
                  var scrollPosition = getScrollTop();
                  document
                    .querySelector('#write')
                    .querySelectorAll('h1, h2, h3, h4, h5, h6')
                    .forEach((element) => {
                      var elementId = element.getAttribute('id');
                      items.push([elementId, scrollPosition + element.getBoundingClientRect().y]);
                    });
                })();
                findActiveHeading();
                updateActiveOutline();
              }, 300);
            },
            'name',
            { value: 'u', configurable: true },
          );
          window.addEventListener('resize', function (unusedParameter1) {
            if (currentTimerId) {
              clearTimeout(currentTimerId);
            }
            scheduleOutlineRefresh();
          });
          scheduleOutlineRefresh();
        }.toString()})();<\/script>`;
      }
      function parseExportHeadContent(htmlContent) {
        if (!htmlContent) {
          return ['', false];
        }
        htmlContent = htmlContent || '';
        var hasTitle = false;
        try {
          if (htmlContent instanceof Array) {
            htmlContent = htmlContent.join('\n');
          }
          var htmlDocument = new DOMParser().parseFromString(htmlContent, 'text/html');
          htmlDocument.querySelectorAll('meta').forEach((item) => {
            item.content = processExportVariables(item.content, exportOptions, void 0, void 0, '');
          });
          htmlDocument.querySelectorAll('title').forEach((item) => {
            hasTitle = true;
            item.innerText = processExportVariables(item.innerText, exportOptions);
          });
          return [
            (htmlContent = htmlDocument.head.innerHTML + htmlDocument.body.innerHTML),
            hasTitle,
          ];
        } catch (error) {
          return [htmlContent, hasTitle];
        }
      }
      function collectExportStyleIncludes(cssText, items, stylesheetPath) {
        Object.defineProperty(appendIncludedResource, 'name', { value: 's', configurable: true });

        if (!cssText) {
          return [];
        }
        items = items || [];
        var includeMatch,
          match,
          includePattern = /^\s*@include-when-export\s+(url)?([('"]+)([^\)"']+)([)'"]+)/im;
        function appendIncludedResource(resourceUrl, basePath) {
          if (resourceUrl) {
            items.push(resolveExportResourceUrl(resourceUrl, basePath));
          }
        }
        if (!forPrint) {
          try {
            if ((match = cssText.match(/^\s*@include-when-export\s.+$/gim))) {
              match.map(function (item) {
                appendIncludedResource((includeMatch = includePattern.exec(item) || [])[3]);
              });
            }
          } catch (error) {}
        }
        includePattern = /^\s*@import\s+(url)?([('"]+)([^\)"']+)([)'"]+)/im;
        try {
          if ((match = cssText.match(/^\s*@import\s.+$/gim))) {
            match.map(function (item) {
              if ((includeMatch = includePattern.exec(item) || [])[3]) {
                if (!(/\.css/.exec(includeMatch[3]) && !/^https?:/.exec(includeMatch[3]))) {
                  appendIncludedResource(includeMatch[3], stylesheetPath);
                }
              }
            });
          }
        } catch (currentError) {}
        return items;
      }
      function resolveExportResourceUrl(text, basePath) {
        text = (text = text.replace(/^marklyra:\/\/app\/typemark/i, function () {
          return location.href.replace(/[\\\/]+[^\\\/]+$/g, '');
        })).replace(/^wkfile:/, 'file:');
        text = utilities.getFilePathFromProxy(text);
        if (!/:\/\//.exec(text)) {
          text = 'file://' + (text = utilities.getAbsolutePath(basePath, text));
        }
        return text;
      }
      if (!exportOptions.exportTheme) {
        if (forPrint && !forImage && File.colorBrightness < 0.5 && noBackground) {
          exportOptions.exportTheme = 'github';
        }
        exportOptions.exportTheme;
      }
      if (!noStyle) {
        themeCss = (function () {
          Object.defineProperty(appendPageBreakStyles, 'name', { value: 'c', configurable: true });
          Object.defineProperty(readStylesheetRules, 'name', { value: 'u', configurable: true });
          Object.defineProperty(shouldIncludeStylesheet, 'name', {
            value: 'b',
            configurable: true,
          });

          var stylesheet,
            regex,
            themeCss,
            stylesheetText,
            stylesheetPath,
            currentTextParts = [];
          function appendPageBreakStyles() {
            if (void 0 !== exportOptions.splitPages) {
              textParts.push(
                "<style type='text/css'>@media print {[data-breakpage]{page-break-before: %@;}#write>[data-breakpage]:first-child {page-break-before: avoid}}</style>".replace(
                  '%@',
                  exportOptions.splitPages ? 'always' : 'avoid',
                ),
              );
            }
          }
          ('');
          if (forPrint) {
            document.querySelectorAll('link[css-include]').forEach(function (item) {
              appendStylesheetLink(resolveExportResourceUrl(item.href));
            });
            if (exportOptions.exportTheme) {
              var exportTheme = exportOptions.exportTheme;
              [`${exportTheme}.css`, 'base.user.css', `${exportTheme}.user.css`].map((item) => {
                if ('base.user.css' == item) {
                  appendPageBreakStyles();
                }
                appendStylesheetLink(getThemeFileUrl(item));
              });
            } else {
              ['theme_css', 'base_user_css', 'theme_user_css'].map(function (item) {
                if ('base_user_css' == item) {
                  appendPageBreakStyles();
                }
                if (File.isMac) {
                  appendStylesheetLink(
                    jquery('#' + item)
                      .attr('href')
                      .replace(/^wkfile:/, 'file:'),
                  );
                } else {
                  appendStylesheetLink(resolveExportResourceUrl(jquery('#' + item).attr('href')));
                }
              });
            }
            return '';
          }
          function readStylesheetRules(stylesheet) {
            var cssRules = [],
              localTextParts = [];
            try {
              cssRules = stylesheet.cssRules;
            } catch (error) {
              console.debug('failed to get rules from ' + stylesheet.href);
            }
            for (var ruleIndex in cssRules) {
              var cssRule = stylesheet.cssRules[ruleIndex];
              if (cssRule.styleSheet) {
                if (cssRule.href.match(/mermaid-zenuml/i) && !hasZenUml) {
                  continue;
                }
                if (cssRule.href.match(/mermaid/i) && !hasMermaid) {
                  continue;
                }
                if (cssRule.href.match(/sourcemode\.dark\.css/i)) {
                  continue;
                }
                localTextParts.push(readStylesheetRules(cssRule.styleSheet));
              } else {
                if (!/@font\-face/.exec(cssRule.cssText || '')) {
                  currentTextParts.push(
                    (cssRule.cssText || '').replace(/content: ([^;]{1});/g, "content: '$1';"),
                  );
                  localTextParts.push(
                    (cssRule.cssText || '').replace(/content: ([^;]{1});/g, "content: '$1';"),
                  );
                }
              }
            }
            return localTextParts.join('\n');
          }
          var linkedStyles = [];
          function shouldIncludeStylesheet(stylesheetUrl) {
            if (stylesheetUrl && stylesheetUrl.match(/mermaid-zenuml/)) {
              return hasZenUml;
            } else {
              return regex.exec(stylesheetUrl);
            }
          }
          themeCss = ['theme_css', 'base_user_css', 'theme_user_css']
            .map(function (item) {
              stylesheetPath =
                exportOptions.exportTheme && 'theme_css' == item
                  ? getThemeFileUrl(`${exportOptions.exportTheme}.css`).replace(/^file:\/\//, '')
                  : exportOptions.exportTheme && 'base_user_css' == item
                    ? getThemeFileUrl(`${exportOptions.exportTheme}.user.css`).replace(
                        /^file:\/\//,
                        '',
                      )
                    : resolveExportResourceUrl(jquery('#' + item).attr('href')).replace(
                        /^file:\/\//,
                        '',
                      );
              collectExportStyleIncludes(
                (stylesheetText = readStylesheetText(stylesheetPath)),
                void 0,
                stylesheetPath,
              ).forEach(function (text) {
                if (/^\/\//.exec(text) || /.+:\/\//.exec(text)) {
                  appendStylesheetLink(text.replace(/^wkfile:/, 'file:'), linkedStyles);
                }
              });
              appendInlineStylesheet(
                (stylesheetText = Object.defineProperty(
                  function collectCssResources(cssText, stylesheetPath) {
                    Object.defineProperty(resolveCssResource, 'name', {
                      value: 'o',
                      configurable: true,
                    });

                    var quotePattern = /^["']/,
                      localTextParts = [];
                    function resolveCssResource(text) {
                      var quoteCharacter = (text.match(quotePattern) || [''])[0];
                      text = decodeURI(
                        quoteCharacter.length ? text.substring(1, text.length - 1) : text,
                      );
                      if (
                        (text = utilities.getAbsolutePath(stylesheetPath, text)).match(/\.css$/)
                      ) {
                        console.debug('fetch CSS from @import: ' + text);
                        localTextParts.push(collectCssResources(readStylesheetText(text), text));
                        text = '';
                      } else {
                        text = (File.isMac ? 'file://' : 'file:///') + text;
                      }
                      return quoteCharacter + encodeURI(text) + quoteCharacter;
                    }
                    stylesheetPath = resolveExportResourceUrl(stylesheetPath).replace(
                      /^file:\/\/?/,
                      '',
                    );
                    cssText = (cssText || '')
                      .replace(/@charset[^;\n]+;?/g, '')
                      .replace(/@font\-face\s*{[^}]+}\s*\n/g, '')
                      .replace(
                        /(^|;|\n)[\s]*@import([^;\n]+)(;|$|\n)/g,
                        function (text, unusedParameter2) {
                          var quotedUrl = (/['"]([^"']+)['"]/.exec(text) || [])[0];
                          if (quotedUrl) {
                            return text.replace(quotedUrl, resolveCssResource(quotedUrl));
                          } else {
                            return text;
                          }
                        },
                      )
                      .replace(/url\([^:)]+\)/gi, function (textSlice) {
                        return (
                          'url(' +
                          resolveCssResource(
                            (textSlice = textSlice.substring(4, textSlice.length - 1)),
                          ) +
                          ')'
                        );
                      });
                    return (cssText = localTextParts.join('\n') + cssText);
                  },
                  'name',
                  { value: 'e', configurable: true },
                )(stylesheetText, stylesheetPath)),
                item,
                linkedStyles,
              );
              return stylesheetText;
            })
            .join('\n');
          regex = ['(base\\.css)'];
          if (!themeCss) {
            regex.push('(theme)');
          }
          if (hasCodeBlocks) {
            regex.push('(codemirror)');
          }
          if (hasMermaid) {
            regex.push('(mermaid)');
          }
          regex = new RegExp(regex.join('|'), 'i');
          for (var itemIndex = 0; itemIndex < document.styleSheets.length; itemIndex++) {
            if (
              shouldIncludeStylesheet((stylesheet = document.styleSheets[itemIndex]).href) &&
              (appendInlineStylesheet(
                readStylesheetRules(stylesheet),
                (stylesheet.href.match(/([^//\\]+)\.css$/) || [])[1],
              ),
              /themes/.exec(stylesheet.href))
            ) {
              try {
                var currentText = resolveExportResourceUrl(stylesheet.href),
                  includeStylesheetPath = decodeURI(
                    currentText.replace(File.isWin ? /^[\w_-]+:[\/]+/ : /^[\w_-]+:\/\/?/, ''),
                  );
                collectExportStyleIncludes(
                  readStylesheetText(includeStylesheetPath),
                  void 0,
                  includeStylesheetPath,
                ).map((item) => appendStylesheetLink(item));
              } catch (currentError) {}
            }
          }
          textParts.push(...linkedStyles);
          if (themeCss) {
            currentTextParts.push(themeCss);
          }
          return currentTextParts.join('\n');
        })();
      }
      if (hasMermaid && exportOptions.exportTheme && !noStyle) {
        var exportThemeCss = themeCss;
        if (!exportThemeCss) {
          [`${exportOptions.exportTheme}.css`, `${exportOptions.exportTheme}.user.css`].map(
            (item) => {
              exportThemeCss += Object.defineProperty(
                function readStylesheetWithImports(stylesheetPath) {
                  importCount++;
                  var stylesheetText = readStylesheetText(stylesheetPath);
                  if (importCount > 10) {
                    return stylesheetText;
                  }
                  var items = [];
                  collectExportStyleIncludes(stylesheetText, items, stylesheetPath);
                  items.forEach(function (text) {
                    if (/^file:\/\//.exec(text)) {
                      stylesheetText =
                        readStylesheetWithImports(text.replace(/^file:\/\//, '')) + stylesheetText;
                    }
                  });
                  return stylesheetText;
                },
                'name',
                { value: 'e', configurable: true },
              )(getThemeFileUrl(item).replace('file://', ''));
            },
          );
        }
        collectionOptions.mermaidSVGs =
          await editor.diagrams.mermaidSvgForExportTheme(exportThemeCss);
      }
      return (function (bodyHtml, documentTitle) {
        if (footnotes.length) {
          bodyHtml +=
            "<div class='footnotes-area' " +
            (forPrint ? 'data-breakpage' : '') +
            ' ><hr/>' +
            renderFootnoteLines(footnotes) +
            '</div>';
        }
        var printScript = forPrint
            ? "<script> window.setBreakPage = function(b){var node = document.querySelectorAll('[data-breakpage]'); for(var i=0;i<node.length;i++){node[i].style.pageBreakBefore = b ? 'always':'auto' } return node[0] && node[0].style.pageBreakBefore};<\/script>"
            : '',
          platformClass = forPrint ? (File.isMac ? 'is-mac' : 'is-node') : '',
          fontSize = exportOptions.fontSize || document.body.parentElement.style.fontSize || '';
        if (fontSize) {
          if ('number' == typeof fontSize) {
            fontSize = `${fontSize}px`;
            exportOptions.fontSize = fontSize;
          }
          fontSize = " style='font-size:" + fontSize + " !important'";
        }
        if (forPrint && File.isMac) {
          printScript += '<script>(' + normalizeFragmentLinks.toString() + ')();<\/script>';
        }
        if (forPrint) {
          printScript += '<script>(' + fitExportedTables.toString() + ')();<\/script>';
        }
        var headContent = parseExportHeadContent(exportOptions.appendHead),
          extraHeadContent = parseExportHeadContent(exportOptions.appendHeadExtra);
        headContent[0] = headContent[0] + extraHeadContent[0];
        headContent[1] =
          headContent[1] || extraHeadContent[1]
            ? ''
            : `<title>${utilities.escape(documentTitle || '')}</title>`;
        var bodyAppendix =
          parseExportHeadContent(exportOptions.appendBody)[0] +
          parseExportHeadContent(exportOptions.appendBodyExtra)[0];
        if (noStyle) {
          return (
            `<!doctype html>\n<html>\n<head>\n<meta charset='UTF-8'><meta name='viewport' content='width=device-width initial-scale=1'>\n${headContent[1]}\n${headContent[0]}</head>\n<body>` +
            bodyHtml +
            `${bodyAppendix}</body>\n</html>`
          );
        }
        var currentTextParts = ['marklyra-export'];
        if (forImage) {
          currentTextParts.push('for-image');
          appendInlineStylesheet(' ::-webkit-scrollbar {display: none;} ', 'for-image');
        } else {
          if (forPrint) {
            currentTextParts.push('marklyra-print');
            appendInlineStylesheet(
              (function () {
                for (
                  var localTextParts = [''], headingDepth = 1;
                  headingDepth < 7;
                  headingDepth++
                ) {
                  var headingTag = `h${headingDepth}`,
                    element = document.querySelector(`#write ${headingTag}`);
                  if (element) {
                    var computedStyle = window.getComputedStyle(element);
                    if (
                      /^0px/.exec(computedStyle.border || '') &&
                      / 0px$/.exec(computedStyle.outline || '') &&
                      'none' === computedStyle.boxShadow &&
                      'none' === computedStyle.backgroundImage &&
                      'rgba(0, 0, 0, 0)' === computedStyle.backgroundColor
                    ) {
                      var content = window.getComputedStyle(element, 'after').content;
                      if (!('none' !== content && content)) {
                        localTextParts.push(
                          `.marklyra-export ${headingTag}::after {content: "";display: block;height: 100px;margin-bottom: -100px;}`,
                        );
                      }
                    }
                  }
                }
                return localTextParts.join('\n');
              })(),
              'for-print',
            );
          }
        }
        if (document.querySelector('mjx-container')) {
          appendInlineStylesheet(MathJax.svgStylesheet().innerHTML, 'mathjax');
          if (!forImage) {
            appendInlineStylesheet(
              'mjx-container[jax="SVG"] path[data-c], mjx-container[jax="SVG"] use[data-c] {\n\t\t\t\t\t\t\tstroke-width: 0;\n\t\t\t\t\t\t}',
              'mathjax-ni',
            );
          }
        }
        var paddingLeft = window.getComputedStyle(document.querySelector('ol, ul')).paddingLeft;
        if (parseInt(paddingLeft) <= 40) {
          appendInlineStylesheet('ol, ul {padding-left: 40px}', 'lp');
        }
        if (File.isMac) {
          appendInlineStylesheet(
            ' @media print { @page {margin: 0 0 0 0;} body.marklyra-export {padding-left: 0; padding-right: 0;} #write {padding:0;}}',
            'mac-print',
          );
        } else {
          if (exportOptions['paper.margin']) {
            if ('custom' === exportOptions['paper.margin']) {
              appendInlineStylesheet(
                'body.marklyra-export {padding-left: $2mm; padding-right: $4mm;} #write {max-width: initial;}}'
                  .replace('$2', valueOrFallback(exportOptions['paper.marginLeft'], '16'))
                  .replace('$4', valueOrFallback(exportOptions['paper.marginRight'], '16')),
                'mac-margin',
              );
            } else {
              appendInlineStylesheet(
                'body.marklyra-export {padding-left: 16mm; padding-right: 16mm;} #write {max-width: initial;}}',
                'electron-margin',
              );
            }
          }
        }
        if (!File.option.preLinebreakOnExport) {
          appendInlineStylesheet(
            ' .marklyra-export li, .marklyra-export p, .marklyra-export,  .footnote-line {white-space: normal;} h1,h2,h3,h4,h5 {white-space:pre-line}',
            'preLinebreakOnExport',
          );
        }
        if (File.option.indentFirstLine) {
          platformClass += ' first-line-indent';
        }
        if (document.body.classList.contains('os-windows')) {
          currentTextParts.push('os-windows');
          if (File.option.monocolorEmoji) {
            currentTextParts.push('monocolor-emoji');
          }
        }
        if (extraCss) {
          appendInlineStylesheet(extraCss, 'extraCSS');
        }
        var sidebarHtml = '';
        if (exportOptions.sidebar) {
          if (
            (sidebarHtml = (function () {
              editor.library.outline.updateOutlineHtml(editor.nodeMap.toc, true);
              var outlineHtml = jquery('#outline-content').html();
              if (!outlineHtml || jquery('#outline-content').find('.outline-item').length <= 1) {
                return '';
              }
              var sidebarElement = jquery(
                "<div class='marklyra-export-sidebar'><div class='outline-content'>" +
                  outlineHtml +
                  '</div></div>',
              );
              sidebarElement.find('.outline-label').each(function () {
                if (this.classList.contains('outline-active')) {
                  this.classList.remove('outline-active');
                  this.parentElement.classList.remove('outline-item-active');
                }
                this.setAttribute(
                  'href',
                  '#' + collectionOptions.anchorMap[this.getAttribute('data-ref')],
                );
                this.removeAttribute('data-ref');
                this.outerHTML = this.outerHTML
                  .replace(/^<span/, '<a')
                  .replace(/<\/span>$/, '</a>');
              });
              sidebarElement.find('.outline-item-signle').removeClass('outline-item-signle');
              if (document.body.classList.contains('no-collapse-outline')) {
                sidebarElement.find('.outline-item-single').removeClass('outline-item-single');
              }
              return sidebarElement[0].outerHTML;
            })())
          ) {
            currentTextParts.push('marklyra-export-show-outline');
            if (document.body.classList.contains('no-collapse-outline')) {
              currentTextParts.push('marklyra-export-no-collapse-outline');
            } else {
              currentTextParts.push('marklyra-export-collapse-outline');
            }
          }
          printScript += createOutlineNavigationScript();
        }
        console.debug(textParts);
        return `<!doctype html>\n<html${fontSize}>\n<head>\n<meta charset='UTF-8'><meta name='viewport' content='width=device-width initial-scale=1'><style type='text/css'>html {overflow-x: initial !important;}</style>\n${textParts.join('\n')}\n${headContent[0]}\n${headContent[1]}\n</head>\n<body class='${currentTextParts.join(' ')}'><div class='marklyra-export-content'>\n${sidebarHtml}<div id='write' ${forPrint ? "style='top:auto'" : ''} class='${platformClass}'>${bodyHtml}</div></div>\n${printScript}${bodyAppendix}</body>\n</html>`;
      })(this.exportCollection(documentMap.blocks, footnotes, collectionOptions), documentTitle);
    }
    cleanUpTempFiles() {}
    async exportWithCommand(option) {
      var outputPath = '';
      if ('saveFolder' == option.saveDialog) {
        outputPath = await fileIntegration.showExportDialog(
          void 0,
          Object.assign({ selectFolder: true }, option),
        );
      }
      if ('saveFile' == option.saveDialog) {
        var mappedItems = ((option.extensions || '').trim().split(/\s+/g) || []).map((text) =>
          text.replace(/^\./, ''),
        );
        outputPath = await fileIntegration.showExportDialog(
          void 0,
          option,
          mappedItems
            ? [
                { name: option.label || 'Exported File', extensions: mappedItems },
                { name: jquery.localize.getString('All Files', 'Panel'), extensions: ['*'] },
              ]
            : void 0,
        );
      }
      var commandText = ExportController.processExportVariables(option.command || '', {
        outputPath: outputPath,
      });
      console.debug('run export command ' + commandText);
      if (!outputPath && option.saveDialog) {
        document.body.classList.remove('marklyra-show-notification');
        return null;
      }
      var cwd = fileIntegration.getCurrentFileFolderPath() || window._options.documentsPath || '/';
      if (File.isNode) {
        pandocExport.customExport(outputPath, commandText, cwd, option);
      }
      this.recordLastExport(option, outputPath);
      return { output: outputPath, args: commandText || '', cwd: cwd, option: option };
    }
  }
  Object.defineProperty(ExportController, 'name', { value: 'F', configurable: true });
  function renderFootnoteLines(items) {
    return items
      .map(function (item) {
        return "<div class='footnote-line'>" + item.join('') + '</div>';
      })
      .join('\n');
  }
  ExportController.processExportVariables = processExportVariables;
  ExportController.onExportSuccess = handleExportSuccess;
  moduleRecord.exports = ExportController;
}
