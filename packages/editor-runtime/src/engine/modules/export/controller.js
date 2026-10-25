// export/controller.
// SystemJS module 46. Dependencies: 13, 11, 19, 31, 43, 29, 17, 15, 1c, 33, 2a, e, 44, 45, 2c.
$__System.registerDynamic(
  '46',
  ['13', '11', '19', '31', '43', '29', '17', '15', '1c', '33', '2a', 'e', '44', '45', '2c'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var documentModel = requireModule('13'),
      currentDocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      utilities = (documentModel.NodeCollectionUtils, requireModule('11')),
      markdownParser = requireModule('19'),
      inlineDecoration = requireModule('31'),
      dialogs = (requireModule('43'), requireModule('29')),
      htmlBlocks = requireModule('17'),
      diagrams = requireModule('15'),
      mathBlocks = requireModule('1c'),
      fileIntegration = requireModule('33'),
      mediaActions = requireModule('2a'),
      jquery = requireModule('e'),
      printAndImageExport = requireModule('44'),
      pandocExport = requireModule('45'),
      fitExportedTables =
        (requireModule('2c'),
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
            scrollWidth > offsetWidth &&
              scrollWidth > 50 &&
              ((domNode.style.zoom = offsetWidth / scrollWidth),
              (parentElement.style.overflowX = 'visible'));
          }
        }),
      b = function () {
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
            i = function (text) {
              return text
                .replace(/["\\\b\t\n\f\r]/g, function (character) {
                  return escapeMap[character];
                })
                .replace(/\u200b/g, '');
            },
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
              aElement.appendChild(textNode),
                aElement.setAttribute('class', 'md-print-anchor'),
                aElement.setAttribute('href', 'uaf://' + i(anchorName)),
                domNode.parentNode.insertBefore(aElement, domNode);
            }
            linkTarget &&
              (match = fragmentPattern.exec(linkTarget)) &&
              ((linkTarget = match[1]), domNode.setAttribute('href', 'uat://' + i(linkTarget)));
          }
        }
      };
    var w = async function (
        exportType,
        outputPath,
        exportOptions,
        text,
        errorText,
        commandArguments,
      ) {
        'custom' == (exportOptions = exportOptions || {}).type && (exportType = 'custom');
        var revealLabel = jquery.localize.getString(
            File.isMac ? 'Reveal in Finder' : 'Reveal in File Explorer',
            'Front',
          ),
          commandFailed = !1,
          saveDialog = exportOptions.saveDialog;
        if (exportOptions.runCommand) {
          saveDialog = !0;
          var commandText = F.processExportVariables(exportOptions.runCommandStr || '', {
              outputPath: outputPath,
            }),
            workingDirectory =
              fileIntegration.getCurrentFileFolderPath() || window._options.documentsPath || '/',
            commandResult = await (function (args, workingDirectory) {
              return File.isNode
                ? pandocExport.runExportCommand(args, workingDirectory)
                : File.isMac
                  ? new Promise((resolvePromise) => {
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
                    })
                  : void 0;
            })(commandText, workingDirectory);
          (text = commandResult.message || ''),
            0 != commandResult.code &&
              ((commandFailed = !0), (errorText = commandResult.error || ''));
        }
        if (commandFailed || exportOptions.showOutput) {
          var errorHtml = '',
            outputHtml = '';
          errorText &&
            (errorHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(errorText)}</pre>`),
            (!text && errorText) ||
              (outputHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(text) || '(empty)'}</pre>`);
          var logHtml = `<pre style='user-select: text;font-size: .9em;cursor: text;line-height: 1.4;text-align:left;'>${utilities.escape(exportOptions.runCommandStr || exportOptions.args || exportOptions.command) || '(empty)'}</pre>`;
          dialogs.showDialog({
            leftAlign: !0,
            title: jquery.localize.getString(
              commandFailed ? 'Run command after export failed' : 'Export Success!',
              'Panel',
            ),
            html: `<div>${jquery.localize.getString('Command Arguments:', 'Panel')}</div>${logHtml}<div>${jquery.localize.getString('Console Output:', 'Panel')}</div>${errorHtml}${outputHtml}`,
            buttons: saveDialog
              ? [revealLabel, jquery.localize.getString('Close')]
              : [jquery.localize.getString('Close')],
            callback: function (buttonIndex) {
              saveDialog && !buttonIndex && JSBridge.showInFinder(outputPath);
            },
          }),
            dialogs.hideNotification();
        } else
          !(function () {
            var notificationTitle = errorText
              ? 'Export operation succeeded with warnings.'
              : 'Export operation finished successfully.';
            (notificationTitle = jquery.localize.getString(notificationTitle, 'Panel')),
              'custom' == exportType
                ? (exportOptions.showOutput &&
                    (notificationTitle = text.trim().split('\n').last() || notificationTitle),
                  exportOptions.saveDialog || (revealLabel = void 0))
                : exportOptions.runCommand &&
                  (notificationTitle = text.trim().split('\n').last() || notificationTitle);
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
              { checkFocus: !0 },
            );
          })();
        exportOptions.openExportLocation &&
          (JSBridge.showInFinder(outputPath),
          !errorText && setTimeout(dialogs.hideNotification, 2e3)),
          exportOptions.openExportFile &&
            (JSBridge.openFile(outputPath),
            !errorText && setTimeout(dialogs.hideNotification, 2e3)),
          File.isMac && File.editor.export.cleanUpTempFiles();
      },
      x = function (text, exportVariables, variableOverrides, quoteArguments, missingValue) {
        (exportVariables = exportVariables || {}), (variableOverrides = variableOverrides || {});
        var outputPath = exportVariables.outputPath || variableOverrides.outputPath || '';
        function s(inputText) {
          return 'string' == typeof inputText
            ? 'unset' == inputText
              ? ''
              : inputText.replace(/\n(.|\n\r)+/g, '')
            : inputText instanceof Array
              ? inputText.join(', ')
              : void 0 === inputText || null === inputText
                ? inputText
                : inputText + '';
        }
        function l(...values) {
          for (var value of values) if (void 0 !== value) return value;
        }
        return text
          .replace(/\${([^\r\n}]+)}/gi, function (unusedParameter1, variableName) {
            var normalizedText = (variableName || '').toLowerCase();
            if ('today' == normalizedText) return new Date().toISOString().substring(0, 10);
            if ('outputpath' == normalizedText) return outputPath;
            if ('outputfolder' == normalizedText || 'outputfolderpath' == normalizedText)
              return utilities.pathByDeleteLastComponent(outputPath);
            if ('outputfoldername' == normalizedText) return utilities.getFolder(outputPath);
            if ('outputfilename' == normalizedText)
              return fileIntegration.getFileNameFromPath(outputPath).replace(/\..+$/, '');
            if ('outputfilefullname' == normalizedText)
              return fileIntegration.getFileNameFromPath(outputPath);
            if ('currentpath' == normalizedText) return File.bundle.filePath || '';
            if ('currentfolder' == normalizedText)
              return fileIntegration.getCurrentFileFolderPath() || '';
            if ('currentfilename' == normalizedText)
              return fileIntegration
                .getFileNameFromPath(File.bundle.filePath || '')
                .replace(/\..+$/, '');
            if ('currentfilefullname' == normalizedText)
              return fileIntegration.getFileNameFromPath(File.bundle.filePath || '');
            if ('openedFolder' == normalizedText) return File.getMountFolder();
            var localSettingBridge = File.editor.localSettingBridge,
              resolvedValue = s(
                l(
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
              for (var currentText of parts)
                if (
                  !(nestedValue = nestedValue
                    ? nestedValue[currentText]
                    : localSettingBridge.getSetting(currentText) ||
                      localSettingBridge.getSetting(currentText.toLowerCase()))
                )
                  break;
              if (void 0 != nestedValue)
                return (function (inputText) {
                  return quoteArguments && /['";&|><\s]/.exec(inputText)
                    ? '' + inputText.replace(/['"]/g, '') + ''
                    : inputText;
                })(s(nestedValue));
            }
            return l(resolvedValue, missingValue, '${' + variableName + '}');
          })
          .replace(/(['"])(.*?)\1/g, function (unusedParameter1, quoteCharacter, inputText) {
            return quoteCharacter + inputText.replace(/\uE033|\uE034/g, '') + quoteCharacter;
          })
          .replace(/\uE033(.*?)\uE034/g, function (unusedParameter1, quotedValue) {
            return '"' + quotedValue + '"';
          });
      };
    const C = (text, exportOptions) => {
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
        return (
          (SPANElement.textContent = text),
          (SPANElement.style.color = jquery('p').css('color')),
          (SPANElement.style.fontFamily = '-apple-system'),
          (SPANElement.style.fontSize = '6pt'),
          SPANElement.outerHTML
        );
      }
    };
    class F {
      constructor(editor) {
        (this.editor = editor),
          (this.processExportVariables = x),
          (this.onExportSuccess = w),
          this.registerBridge();
      }
      recordLastExport(exportOptions, path) {
        delete exportOptions.overwrite, delete exportOptions.path;
        var lastExport = Object.assign({ path: path }, exportOptions);
        JSBridge.invoke('export.recordLastExport', lastExport),
          (File.option.lastExport = lastExport),
          (File.option.lastExportNoOverwrite = !1);
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
          }),
            bridge.registerHandler('export.onExportSuccess', function (result, respond) {
              w(result.type, result.path, result.option, result.message, result.error, result.args),
                respond && respond();
            }),
            bridge.registerHandler(
              'export.onExportCanceled',
              function (unusedParameter1, unusedParameter2) {
                dialogs.hideNotification();
              },
            ),
            bridge.registerHandler('export.onExportFailed', function (errorDetails, respond) {
              var DIVElement = document.createElement('DIV');
              (DIVElement.innerHTML = jquery.localize
                .getString('Failed to export file to <em>{0}</em>', 'Panel')
                .format(
                  errorDetails.path
                    ? utilities.escape(errorDetails.path)
                    : jquery.localize.getString('Export Failed', 'Panel'),
                )),
                dialogs.hideNotification(),
                dialogs.showErrorDialog(
                  DIVElement.textContent,
                  utilities.escape(errorDetails.error),
                ),
                console.sendError(errorDetails.error, 'warning'),
                respond && respond();
            }),
            bridge.registerHandler('export.dataForExport', async function (exportOptions, respond) {
              receiver.showExportNotification(!0),
                setTimeout(
                  function () {
                    setTimeout(
                      async function () {
                        exportOptions.forImage &&
                          (exportOptions = Object.assign(
                            { fontSize: '24px', width: 640 },
                            exportOptions,
                          ));
                        var documentText = jquery('[cid]').text(),
                          hasNonAlphabet = !!/[\u4E00-\u9FCC]{4}/.exec(documentText);
                        respond({
                          suggestedFilename: File.getSuggestedFileName() || '',
                          content: await receiver.exportToHTML(exportOptions || {}),
                          pdfHeader: C(exportOptions.header, exportOptions),
                          pdfFooter: C(exportOptions.footer, exportOptions),
                          hasNonAlphabet: hasNonAlphabet,
                        });
                      },
                      receiver.beforeExport(exportOptions.forPrint) ? 1e3 : 0,
                    ),
                      receiver.showExportNotification(!0);
                  },
                  File.isMac ? 50 : 0,
                );
            }),
            bridge.registerHandler('export.exportToHTML', function (exportOptions, respond) {
              receiver.showExportNotification(!0),
                setTimeout(
                  async function () {
                    File.sync();
                    var exportedHtml = await receiver.exportToHTML(exportOptions);
                    respond(exportedHtml);
                  },
                  File.isMac ? 400 : 0,
                );
            }),
            bridge.registerHandler(
              'export.exportWithCommand',
              async function (exportOptions, respond) {
                var commandResult = await receiver.exportWithCommand(exportOptions);
                exportOptions.path || (exportOptions.path = exportOptions.output),
                  respond(commandResult);
              },
            ),
            bridge.registerHandler('pdf.getFixData', function (exportOptions, respond) {
              exportOptions = exportOptions || {};
              try {
                exportOptions[':headers:'] = receiver.editor.library.outline.getHeaderMatrix(!0);
                var calculatedSettings = receiver.editor.localSettingBridge.getCalculatedSetting();
                exportOptions = Object.assign(exportOptions, calculatedSettings);
              } catch (error) {
                console.sendError(error);
              }
              respond(exportOptions);
            }),
            bridge.registerHandler('export.prepare', function (exportOptions, respond) {
              File.editor.EditHelper.hideNotification(),
                respond(
                  (exportOptions = File.editor.localSettingBridge.loadExportOption(exportOptions)),
                );
            });
        }
      }
      beforeExport(restoreSourceMode) {
        return (
          File.editor.sourceView.inSourceMode
            ? (File.editor.sourceView.hide(),
              File.editor.library.recoverSidebar(),
              File.isMac && bridge.callHandler('window.updateUIAfterExitSourceMode'))
            : (File.editor.store(!0), (restoreSourceMode = !1)),
          File.sync(),
          File.editor.nodeMap.toc.updateHTML(),
          File.megaMenu && File.megaMenu.hide(),
          document.body.classList.remove('marklyra-show-notification'),
          restoreSourceMode
        );
      }
      showExportNotification(disableAnimation) {
        dialogs.showProcessingNotification('Exporting in progress...', disableAnimation);
      }
      exportToNative(exportType, t, folder, exportOptions) {
        (t = t || function () {}), (exportOptions = exportOptions || {});
        var target =
          'pandoc' == exportType || 'native' == exportType
            ? exportOptions.raw || exportOptions.targetFormat
            : exportType;
        'latex-pdf' == target ? (target = 'latex') : 'mediawiki' == target && (target = 'wiki');
        var nativeOptions = Object.assign(
          { cwd: fileIntegration.getCurrentFileFolderPath() },
          exportOptions,
          {
            target: target,
            folder: folder,
          },
        );
        return (
          File.isMac &&
            exportOptions.extraArguments &&
            (nativeOptions.extraArguments = exportOptions.extraArguments.map((item) =>
              File.editor.export.processExportVariables(item, { outputPath: exportOptions.path }),
            )),
          this.editor.nodeMap.exportToNative(
            target,
            function (nativeContent) {
              t(nativeContent, nativeOptions);
            },
            folder,
            Object.assign({}, nativeOptions),
          )
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
            error
              ? (dialogs.showDialog({
                  title: jquery.localize.getString('Error'),
                  html:
                    jquery.localize
                      .getString('Failed to export file to <em>{0}</em>', 'Panel')
                      .format(utilities.escape(outputPath)) +
                    '<br/>' +
                    utilities.escape(error.message),
                  backdrop: 'static',
                  type: 'error',
                }),
                console.sendError(error, 'warn'))
              : w('html', outputPath, exportOptions);
          });
        }
      }
      exportCollection(collection, footnotes, exportOptions) {
        var currentText = exportOptions || {},
          forPrint = currentText.forPrint,
          noStyle = currentText.noStyle,
          exportFooter = currentText.exportFooter,
          exportInline = currentText.exportInline,
          forImage = currentText.forImage,
          anchorMap = currentText.anchorMap || {},
          anchorList = currentText.anchorList || dialogs.fetchAnchorList(anchorMap, noStyle);
        (currentText.anchorList = anchorList), (currentText.anchorMap = anchorMap);
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
                        !1,
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
                    return (
                      footnotes[skipFootnote].push(
                        " <a name='dfref-footnote-" +
                          referenceId +
                          "' href='#ref-footnote-" +
                          referenceId +
                          "' title='" +
                          jquery.localize.getString('back to document') +
                          "' class='reversefootnote' >↩</a>",
                      ),
                      referenceId
                    );
                  },
                  noStyle: noStyle,
                  forPrint: forPrint,
                  forExport: !0,
                  anchorList: anchorList,
                  skipOp: { atag: !0, underline: !0, comment: !0, imgtag: !0 },
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
        function _(documentNode, renderState) {
          if ('string' == typeof documentNode)
            return exportInline.output(documentNode, inlineDecoration.decorateAsExport);
          var children = documentNode.get('children');
          if (currentDocumentNode.canContainBlock(documentNode.get('type')))
            return children && children.length > 0
              ? ((currentText.exportFooter = !1),
                receiver.exportCollection(children, footnotes, currentText))
              : exportInline.output(documentNode.get('text'), inlineDecoration.decorateAsExport);
          var parentNode = documentNode.get('parent'),
            inlineOptions = {};
          return (
            currentDocumentNode.isType(documentNode, NodeType.paragraph) &&
              !documentNode.get('before') &&
              currentDocumentNode.isType(parentNode, NodeType.blockquote) &&
              parentNode.get('alert') &&
              (inlineOptions.alert = !0),
            exportInline.output(
              documentNode.get('text'),
              inlineDecoration.decorateAsExport,
              void 0,
              inlineOptions,
              renderState,
            )
          );
        }
        (currentText.exportInline = exportInline), (footnotes = footnotes || []);
        var tocHtml = null;
        function M() {
          if (noStyle) return '<div>[TOC]</div>';
          if (!tocHtml) {
            var tocElement = jquery(document.querySelector('.md-toc-content')).clone();
            if (!tocElement[0]) return '';
            tocElement.find('[data-ref]').each(function () {
              forPrint
                ? this.querySelector('a').setAttribute(
                    'href',
                    (File.isMac ? 'at://' : '#header-') + this.getAttribute('data-ref'),
                  )
                : this.querySelector('a').setAttribute(
                    'href',
                    '#' + anchorMap[this.getAttribute('data-ref')],
                  );
            }),
              tocElement.find('.md-meta').remove(),
              (tocHtml = "<div class='md-toc' mdtype='toc'>" + tocElement[0].outerHTML + '</div>');
          }
          return tocHtml;
        }
        function L(documentNode) {
          function t(nodeId) {
            return nodeId
              ? documentMap.toc.headers.findIndex(function (item) {
                  return item.cid == nodeId;
                })
              : -1;
          }
          var renderState = { cid: documentNode.cid };
          switch (documentNode.get('type')) {
            case NodeType.paragraph:
              if (-1 == documentNode.get('text').indexOf('\n')) {
                var parsedNode = currentDocumentNode.parseFrom(
                  documentNode.getText(),
                  null,
                  { noTop: !0, skips: { fromP: !0, old_code: !1 } },
                  !0,
                )[1][0];
                if (
                  currentDocumentNode.isType(parsedNode, NodeType.heading) &&
                  ((parsedNode.cid = documentNode.cid),
                  -1 == t(parsedNode.cid) && documentNode.isTopBlock())
                ) {
                  var precedingHeadingId = editor
                    .findElemById(parsedNode.cid)
                    .prevAll('.md-heading')
                    .first()
                    .attr('cid');
                  documentMap.toc.headers.splice(t(precedingHeadingId) + 1, 0, parsedNode);
                }
                if (
                  currentDocumentNode.isType(
                    parsedNode,
                    NodeType.heading,
                    NodeType.def_footnote,
                    NodeType.def_link,
                  )
                )
                  return (parsedNode.cid = documentNode.cid), L(parsedNode);
              }
              var inlineHtml = _(documentNode, renderState);
              return '' == inlineHtml || renderState.hasContent
                ? !currentText.noStyle &&
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
                      return !1;
                    }
                    return !1;
                  })(inlineHtml)
                  ? "<p><span class='md-image'>" + inlineHtml + '</span></p>'
                  : '<p>' + (inlineHtml || '&nbsp;') + '</p>'
                : inlineHtml;
            case NodeType.heading:
              var pageBreakAttribute = '';
              forPrint &&
                1 == documentNode.get('depth') &&
                !documentNode.get('parent') &&
                documentNode.get('before') &&
                (pageBreakAttribute = ' data-breakpage');
              var currentElement = null,
                attributeValue = '';
              return (
                forPrint
                  ? ((currentElement = document.createElement('a')),
                    (attributeValue = 'header-' + documentNode.cid),
                    currentElement.setAttribute('name', attributeValue),
                    currentElement.setAttribute('class', 'md-header-anchor md-print-anchor'),
                    currentElement.setAttribute('href', 'af://' + documentNode.cid),
                    (currentElement.innerText = ' '))
                  : (attributeValue = anchorMap[documentNode.cid]),
                `<h${documentNode.get('depth')}${pageBreakAttribute}${currentElement || !attributeValue ? '' : " id='" + utilities.escapeInQuote(attributeValue) + "'"}>${currentElement ? currentElement.outerHTML : ''}${_(documentNode, renderState)}</h${documentNode.get('depth')}>`
              );
            case NodeType.blockquote:
              let alert = documentNode.get('alert');
              return currentDocumentNode.isType(
                alert,
                'note',
                'warning',
                'important',
                'tip',
                'caution',
              )
                ? `<div class="md-alert md-alert-${alert} ${alert}">` +
                    _(documentNode, renderState) +
                    '</div>'
                : '<blockquote>' + _(documentNode, renderState) + '</blockquote>';
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
                    )
                      return !0;
                  }
                  return !1;
                })();
              documentNode.set('loose', isLooseList);
              var startAttribute = '';
              return (
                style == currentDocumentNode.ListType.ol &&
                  ((startAttribute =
                    '' === documentNode.get('start') ? void 0 : documentNode.get('start') - 0),
                  (startAttribute =
                    Number.isNaN(startAttribute) || 1 == startAttribute
                      ? ''
                      : " start='" + documentNode.get('start') + "' ")),
                '<' +
                  style +
                  startAttribute +
                  '>' +
                  blockSeparator +
                  _(documentNode, renderState) +
                  blockSeparator +
                  '</' +
                  style +
                  '>'
              );
            case NodeType.list_item:
              return documentNode.get('style') === currentDocumentNode.ListType.task
                ? '<li' +
                    (noStyle
                      ? ''
                      : " class='md-task-list-item task-list-item task-list-" +
                        (documentNode.get('checked') ? 'done' : 'not-done') +
                        "' ") +
                    "><input type='checkbox' " +
                    (documentNode.get('checked') ? 'checked' : '') +
                    '/>' +
                    _(documentNode, renderState) +
                    '</li>'
                : '<li>' +
                    (function (inputDocumentNode, renderState) {
                      return noStyle && !1 === inputDocumentNode.get('parent').get('loose')
                        ? _(inputDocumentNode.getFirstChild(), renderState)
                        : _(inputDocumentNode, renderState);
                    })(documentNode, renderState) +
                    '</li>';
            case NodeType.fences:
              var language = documentNode.get('lang') || '';
              if (noStyle)
                return language
                  ? '<pre' +
                      markdownParser.attrToString(markdownParser.parsePandocAttr(language)) +
                      "><code class='language-" +
                      (language = utilities.escapeInQuote(getCodeMirrorMode(language, !1, !0))) +
                      "' lang='" +
                      language +
                      "'>" +
                      utilities.escape(documentNode.get('text')) +
                      blockSeparator +
                      '</code></pre>'
                  : '<pre><code>' +
                      utilities.escape(documentNode.get('text')) +
                      blockSeparator +
                      '</code></pre>';
              var showLineNumbers,
                renderedElement = editor.findElemById(documentNode.id).clone();
              if (diagrams.isDiagramType(language)) {
                showLineNumbers = !1;
                var elements = editor.findElemById(documentNode.id).find('svg');
                currentText.mermaidSVGs &&
                  currentText.mermaidSVGs[documentNode.id] &&
                  renderedElement.find('svg').replaceWith(currentText.mermaidSVGs[documentNode.id]);
                var currentElements = renderedElement.find('svg');
                !elements.attr('width') ||
                elements.attr('viewBox') ||
                /%/.exec(elements.attr('width'))
                  ? elements.attr('max-width') &&
                    (currentElements.css('width', elements.attr('max-width')),
                    currentElements.css('max-width', ''))
                  : (currentElements.attr(
                      'viewBox',
                      '0 0 ' + elements.attr('width') + ' ' + elements.height(),
                    ),
                    currentElements.css('max-width', '100%'),
                    currentElements.css('height', 'auto'));
                var diagramElement = renderedElement
                  .find('.md-diagram-panel')
                  .attr('lang', language)
                  .html(renderedElement.find('.md-diagram-panel-preview').html())[0];
                return diagramElement
                  ? mediaActions.processExportedSVG(diagramElement.outerHTML, !0)
                  : '';
              }
              if (mathBlocks.isMathType(documentNode.get('lang')))
                return 'latex' == File.option.mathFormatOnCopy
                  ? "<pre lang='math'><code>%@</code></pre>".replace(
                      '%@',
                      utilities.escape(documentNode.get('text')),
                    )
                  : receiver.getSVGForExport(
                      documentNode,
                      forImage,
                      !currentText.forPrint && !currentText.forImage && !currentText.noStyle,
                    );
              !1 !== showLineNumbers &&
                (showLineNumbers = documentNode.get('text').split(/\n/).length > 13);
              var localElement = document.querySelector('.md-fences .CodeMirror-linenumber');
              if (!currentText.fenceLineFontSize && localElement && forImage) {
                currentText.fenceLineFontSize = window.getComputedStyle(localElement).fontSize;
                let codeLine = document.querySelector('.md-fences .CodeMirror-line');
                codeLine &&
                  currentText.fontSize &&
                  ('number' == typeof currentText.fontSize
                    ? (codeLine.style.fontSize = `${currentText.fontSize}px`)
                    : (codeLine.style.fontSize = currentText.fontSize),
                  (currentText.lineNumberLineHeightStyle =
                    window.getComputedStyle(codeLine).lineHeight),
                  (currentText.lineNumberLineHeightStyle = `line-height:${currentText.lineNumberLineHeightStyle};`),
                  (codeLine.style.fontSize = ''));
              }
              if (
                (renderedElement.children('.CodeMirror').length &&
                  (renderedElement
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
                    .text('\n'),
                  currentText.fenceLineFontSize &&
                    renderedElement
                      .find('.CodeMirror-linenumber')
                      .each(function () {
                        currentText.fenceLineFontSize &&
                          this.setAttribute(
                            'style',
                            this.getAttribute('style') +
                              ';font-size:' +
                              currentText.fenceLineFontSize +
                              ' !important;' +
                              (currentText.lineNumberLineHeightStyle || ''),
                          );
                      })
                      .end()
                      .find('.CodeMirror-gutters')
                      .css('height', '100%')),
                forPrint &&
                  File.option.noLineWrapping &&
                  renderedElement
                    .children('.CodeMirror')
                    .addClass('CodeMirror-wrap')
                    .find('.CodeMirror-sizer')
                    .css('min-width', ''),
                showLineNumbers && renderedElement.css('page-break-inside', 'unset'),
                forPrint && File.isNode)
              ) {
                var fontFamily =
                  window.getComputedStyle(File.editor.writingArea).fontFamily || 'initial';
                (fontFamily = fontFamily.replace(/'/g, "\\'")),
                  renderedElement.find('.CodeMirror-line > span').each(function () {
                    !(function e(domNode, fontFamily) {
                      if (domNode.nodeType == document.TEXT_NODE) {
                        var text = domNode.textContent;
                        (text = text
                          .split(/(;|-)/)
                          .map(function (item) {
                            return ';' == item || '-' == item
                              ? "<span style='font-family:" + fontFamily + "'>" + item + '</span>'
                              : utilities.escape(item);
                          })
                          .join('')) != domNode.textContent && (domNode.innerHTML = text);
                      } else
                        1 == domNode.nodeType &&
                          domNode.childNodes.forEach(function (item) {
                            e(item, fontFamily);
                          });
                    })(this, fontFamily);
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
              return currentText.noStyle && 'latex' == File.option.mathFormatOnCopy
                ? '<div>$$\n%@\n$$</div>'.replace('%@', utilities.escape(documentNode.get('text')))
                : receiver.getSVGForExport(
                    documentNode,
                    forImage,
                    !currentText.forPrint && !currentText.forImage && !currentText.noStyle,
                  );
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
              )
                tableChild.get('before')
                  ? (tableHtml += L(tableChild))
                  : (tableHtml +=
                      '<thead>' +
                      blockSeparator +
                      L(tableChild) +
                      '</thead>' +
                      blockSeparator +
                      '<tbody>'),
                  (tableChild = tableChild.get('after')) ||
                    (tableHtml += '</tbody>' + blockSeparator);
              return (tableHtml += '</table></figure>');
            case NodeType.table_row:
              (tableHtml = '<tr>'), (tableChild = documentNode.getFirstChild());
              for (
                var alignmentAttribute,
                  alignment = documentNode.get('parent').get('align'),
                  currentItemIndex = 0,
                  cellTag = documentNode.get('before') ? 'td' : 'th';
                tableChild;
              )
                (tableHtml +=
                  '<' +
                  cellTag +
                  (alignmentAttribute = (alignmentAttribute = alignment[currentItemIndex])
                    ? " style='text-align:" + alignmentAttribute + ";' "
                    : '') +
                  '>' +
                  L(tableChild) +
                  '</' +
                  cellTag +
                  '>'),
                  (tableChild = tableChild.get('after')),
                  currentItemIndex++;
              return (tableHtml += '</tr>');
            case NodeType.table_cell:
              return _(documentNode, renderState) || '&nbsp;';
            case NodeType.meta_block:
              return '';
            case NodeType.toc:
              return '';
            default:
              return '<p>' + _(documentNode, renderState) + '</p>';
          }
        }
        if ('string' == typeof collection) return _(collection);
        if (collection.length) {
          var isArray = collection instanceof Array,
            currentNode = isArray ? collection[0] : collection.sortedFirst();
          do {
            (localText += L(currentNode) + blockSeparator),
              (currentNode = currentNode.get('after'));
          } while (currentNode && (!isArray || collection.indexOf(currentNode) > -1));
        }
        return (
          (localText = localText.replaceAll
            ? localText.replaceAll('', function () {
                return M();
              })
            : localText.replace(/\uE088/g, function () {
                return M();
              })) + (exportFooter ? S(footnotes) : '')
        );
      }
      getSVGForExport(documentNode, svgOnly, keepAssistiveMath) {
        var editor = this.editor,
          mathElement = editor.findElemById(documentNode.refcid || documentNode.id).clone(),
          elements = mathElement.find('svg');
        keepAssistiveMath || mathElement.find('mjx-assistive-mml').remove(),
          !elements.length &&
            documentNode.refcid &&
            ((documentNode.refcid = void 0),
            (elements = (mathElement = editor.findElemById(documentNode.id)).find('svg')));
        var mathDomNode,
          mathContainers = mathElement.find('mjx-container').clone();
        return svgOnly
          ? mathContainers[0]
            ? mediaActions.processExportedSVG(mathContainers[0].outerHTML, !0)
            : "<p class='md-math-block'>$$" + utilities.escape(documentNode.get('text')) + '$$</p>'
          : mathContainers.length
            ? ((mathElement = mathElement.clone()),
              (mathElement = jquery(
                jquery.parseHTML(
                  mathElement
                    .html('')[0]
                    .outerHTML.replace(/<pre/, '<div')
                    .replace(/<\/pre>/, '</div>'),
                ),
              )).append(mathContainers),
              mathContainers.wrap("<div class='md-math-container'></div>"),
              mediaActions.processExportedSVG(
                ((mathDomNode = mathElement[0]),
                (mathDomNode.innerHTML = mathDomNode.innerHTML.trim()),
                (mathDomNode.children[0].innerHTML = mathDomNode.children[0].innerHTML.trim()),
                mathDomNode).outerHTML,
                !0,
              ))
            : "<p class='md-math-block'>{math}</p>".replace(
                '{math}',
                '$$\n' + utilities.escape(documentNode.get('text')) + '\n$$',
              );
      }
      async exportToHTML(exportOptions) {
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
        function v(cssText, styleId, outputParts) {
          if (!cssText) return '';
          (outputParts || textParts).push(
            `<style type='text/css' ${styleId ? ` id="style-${styleId}"` : ''}>${cssText}</style>`,
          );
        }
        function w(stylesheetUrl, outputParts) {
          if (!stylesheetUrl) return '';
          (outputParts || textParts).push(
            "<link rel='stylesheet' href='" +
              utilities.escapeForPreWrap(stylesheetUrl) +
              "' type='text/css' />",
          );
        }
        noStyle ||
          (editor.mathBlock.currentCm &&
            editor.mathBlock.currentCm.cid &&
            (await editor.mathBlock.stopEditing(editor.mathBlock.currentCm.cid)),
          editor.fences.decorateAll()),
          'latex' != File.option.mathFormatOnCopy &&
            (await editor.mathInline.renderAll(!1, editor.writingArea, !1, !0)),
          File.option.showLineNumbersForFence && editor.fences.refreshEditor(!0);
        var collectionOptions = {
          forPrint: forPrint,
          noStyle: noStyle,
          forImage: forImage,
          fontSize: exportOptions.fontSize,
          anchorMap: {},
        };
        function F(value, fallbackValue) {
          return void 0 === value || null === value || '' === value ? fallbackValue : value;
        }
        function k(filePath) {
          if (File.isMac) return bridge.callSync('path.readText', filePath);
          if (File.isNode) {
            try {
              return reqnode('fs').readFileSync(filePath, 'utf-8');
            } catch (error) {}
            return '';
          }
        }
        var importCount = 0;
        function T(themeFilename) {
          return (
            'file://' +
            (File.isNode
              ? window._options.userDataPath + '/themes/' + themeFilename
              : _options.currentThemeFolder + '/' + themeFilename)
          );
        }
        function _() {
          return `\n<script>(${function () {
            var parentElement = document.body.parentElement,
              items = [],
              activeHeading = null,
              collapseOutline = document.body.classList.contains(
                'marklyra-export-collapse-outline',
              ),
              r = function (eventType, selector, listener) {
                document.addEventListener(
                  eventType,
                  function (event) {
                    if (!event.defaultPrevented)
                      for (
                        var domNode = event.target;
                        domNode && domNode != this;
                        domNode = domNode.parentNode
                      )
                        if (domNode.matches(selector)) {
                          !1 === listener.call(domNode, event) &&
                            (event.preventDefault(), event.stopPropagation());
                          break;
                        }
                  },
                  !1,
                );
              };
            function o() {
              return parentElement.scrollTop;
            }
            r('click', '.outline-expander', function (unusedParameter1) {
              var classList = this.closest('.outline-item-wrapper').classList;
              return (
                classList.contains('outline-item-open')
                  ? classList.remove('outline-item-open')
                  : classList.add('outline-item-open'),
                d(),
                !1
              );
            }),
              r('click', '.outline-item', function (unusedParameter1) {
                var element = this.querySelector('.outline-label');
                if (((location.hash = '#' + element.getAttribute('href')), collapseOutline)) {
                  var classList = this.closest('.outline-item-wrapper').classList;
                  classList.contains('outline-item-open') || classList.add('outline-item-open'),
                    c(),
                    classList.add('outline-item-active');
                }
              });
            var timerId,
              currentTimerId,
              l = function () {
                var scrollPosition = o();
                activeHeading = null;
                for (
                  var itemIndex = 0;
                  itemIndex < items.length && items[itemIndex][1] - scrollPosition < 60;
                  itemIndex++
                )
                  activeHeading = items[itemIndex];
              },
              c = function () {
                document
                  .querySelectorAll('.outline-item-active')
                  .forEach((element) => element.classList.remove('outline-item-active')),
                  document
                    .querySelectorAll('.outline-item-single.outline-item-open')
                    .forEach((element) => element.classList.remove('outline-item-open'));
              },
              d = function () {
                if (activeHeading) {
                  c();
                  var element = document.querySelector(
                    '.outline-label[href="#' +
                      (CSS.escape ? CSS.escape(activeHeading[0]) : activeHeading[0]) +
                      '"]',
                  );
                  if (element)
                    if (collapseOutline) {
                      var currentElement = element.closest(
                        '.outline-item-open>ul>.outline-item-wrapper',
                      );
                      if (currentElement) currentElement.classList.add('outline-item-active');
                      else {
                        for (
                          var localElement = (element =
                            element.closest('.outline-item-wrapper')).parentElement.closest(
                            '.outline-item-wrapper',
                          );
                          localElement;
                        )
                          localElement = (element = localElement).parentElement.closest(
                            '.outline-item-wrapper',
                          );
                        element.classList.add('outline-item-active');
                      }
                    } else
                      element.closest('.outline-item-wrapper').classList.add('outline-item-active');
                }
              };
            window.addEventListener('scroll', function (unusedParameter1) {
              timerId && clearTimeout(timerId),
                (timerId = setTimeout(function () {
                  l(), d();
                }, 300));
            });
            var u = function () {
              currentTimerId = setTimeout(function () {
                !(function () {
                  items = [];
                  var scrollPosition = o();
                  document
                    .querySelector('#write')
                    .querySelectorAll('h1, h2, h3, h4, h5, h6')
                    .forEach((element) => {
                      var elementId = element.getAttribute('id');
                      items.push([elementId, scrollPosition + element.getBoundingClientRect().y]);
                    });
                })(),
                  l(),
                  d();
              }, 300);
            };
            window.addEventListener('resize', function (unusedParameter1) {
              currentTimerId && clearTimeout(currentTimerId), u();
            }),
              u();
          }.toString()})();<\/script>`;
        }
        function A(htmlContent) {
          if (!htmlContent) return ['', !1];
          htmlContent = htmlContent || '';
          var hasTitle = !1;
          try {
            htmlContent instanceof Array && (htmlContent = htmlContent.join('\n'));
            var htmlDocument = new DOMParser().parseFromString(htmlContent, 'text/html');
            return (
              htmlDocument.querySelectorAll('meta').forEach((item) => {
                item.content = x(item.content, exportOptions, void 0, void 0, '');
              }),
              htmlDocument.querySelectorAll('title').forEach((item) => {
                (hasTitle = !0), (item.innerText = x(item.innerText, exportOptions));
              }),
              [(htmlContent = htmlDocument.head.innerHTML + htmlDocument.body.innerHTML), hasTitle]
            );
          } catch (error) {
            return [htmlContent, hasTitle];
          }
        }
        function M(cssText, items, stylesheetPath) {
          if (!cssText) return [];
          items = items || [];
          var includeMatch,
            match,
            includePattern = /^\s*@include-when-export\s+(url)?([('"]+)([^\)"']+)([)'"]+)/im;
          function s(resourceUrl, basePath) {
            resourceUrl && items.push(L(resourceUrl, basePath));
          }
          if (!forPrint)
            try {
              (match = cssText.match(/^\s*@include-when-export\s.+$/gim)) &&
                match.map(function (item) {
                  s((includeMatch = includePattern.exec(item) || [])[3]);
                });
            } catch (error) {}
          includePattern = /^\s*@import\s+(url)?([('"]+)([^\)"']+)([)'"]+)/im;
          try {
            (match = cssText.match(/^\s*@import\s.+$/gim)) &&
              match.map(function (item) {
                (includeMatch = includePattern.exec(item) || [])[3] &&
                  ((/\.css/.exec(includeMatch[3]) && !/^https?:/.exec(includeMatch[3])) ||
                    s(includeMatch[3], stylesheetPath));
              });
          } catch (currentError) {}
          return items;
        }
        function L(text, basePath) {
          return (
            (text = (text = text.replace(/^marklyra:\/\/app\/typemark/i, function () {
              return location.href.replace(/[\\\/]+[^\\\/]+$/g, '');
            })).replace(/^wkfile:/, 'file:')),
            (text = utilities.getFilePathFromProxy(text)),
            /:\/\//.exec(text) ||
              (text = 'file://' + (text = utilities.getAbsolutePath(basePath, text))),
            text
          );
        }
        if (
          (exportOptions.exportTheme ||
            (forPrint &&
              !forImage &&
              File.colorBrightness < 0.5 &&
              noBackground &&
              (exportOptions.exportTheme = 'github'),
            exportOptions.exportTheme),
          noStyle ||
            (themeCss = (function () {
              var stylesheet,
                regex,
                themeCss,
                stylesheetText,
                stylesheetPath,
                currentTextParts = [];
              function c() {
                void 0 !== exportOptions.splitPages &&
                  textParts.push(
                    "<style type='text/css'>@media print {[data-breakpage]{page-break-before: %@;}#write>[data-breakpage]:first-child {page-break-before: avoid}}</style>".replace(
                      '%@',
                      exportOptions.splitPages ? 'always' : 'avoid',
                    ),
                  );
              }
              if (('', forPrint)) {
                if (
                  (document.querySelectorAll('link[css-include]').forEach(function (item) {
                    w(L(item.href));
                  }),
                  exportOptions.exportTheme)
                ) {
                  var exportTheme = exportOptions.exportTheme;
                  [`${exportTheme}.css`, 'base.user.css', `${exportTheme}.user.css`].map((item) => {
                    'base.user.css' == item && c(), w(T(item));
                  });
                } else
                  ['theme_css', 'base_user_css', 'theme_user_css'].map(function (item) {
                    'base_user_css' == item && c(),
                      File.isMac
                        ? w(
                            jquery('#' + item)
                              .attr('href')
                              .replace(/^wkfile:/, 'file:'),
                          )
                        : w(L(jquery('#' + item).attr('href')));
                  });
                return '';
              }
              function u(stylesheet) {
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
                    if (cssRule.href.match(/mermaid-zenuml/i) && !hasZenUml) continue;
                    if (cssRule.href.match(/mermaid/i) && !hasMermaid) continue;
                    if (cssRule.href.match(/sourcemode\.dark\.css/i)) continue;
                    localTextParts.push(u(cssRule.styleSheet));
                  } else
                    /@font\-face/.exec(cssRule.cssText || '') ||
                      (currentTextParts.push(
                        (cssRule.cssText || '').replace(/content: ([^;]{1});/g, "content: '$1';"),
                      ),
                      localTextParts.push(
                        (cssRule.cssText || '').replace(/content: ([^;]{1});/g, "content: '$1';"),
                      ));
                }
                return localTextParts.join('\n');
              }
              var linkedStyles = [];
              function b(stylesheetUrl) {
                return stylesheetUrl && stylesheetUrl.match(/mermaid-zenuml/)
                  ? hasZenUml
                  : regex.exec(stylesheetUrl);
              }
              (themeCss = ['theme_css', 'base_user_css', 'theme_user_css']
                .map(function (item) {
                  return (
                    (stylesheetPath =
                      exportOptions.exportTheme && 'theme_css' == item
                        ? T(`${exportOptions.exportTheme}.css`).replace(/^file:\/\//, '')
                        : exportOptions.exportTheme && 'base_user_css' == item
                          ? T(`${exportOptions.exportTheme}.user.css`).replace(/^file:\/\//, '')
                          : L(jquery('#' + item).attr('href')).replace(/^file:\/\//, '')),
                    M((stylesheetText = k(stylesheetPath)), void 0, stylesheetPath).forEach(
                      function (text) {
                        (/^\/\//.exec(text) || /.+:\/\//.exec(text)) &&
                          w(text.replace(/^wkfile:/, 'file:'), linkedStyles);
                      },
                    ),
                    v(
                      (stylesheetText = (function e(cssText, stylesheetPath) {
                        var quotePattern = /^["']/,
                          localTextParts = [];
                        function o(text) {
                          var quoteCharacter = (text.match(quotePattern) || [''])[0];
                          return (
                            (text = decodeURI(
                              quoteCharacter.length ? text.substring(1, text.length - 1) : text,
                            )),
                            (text = utilities.getAbsolutePath(stylesheetPath, text)).match(/\.css$/)
                              ? (console.debug('fetch CSS from @import: ' + text),
                                localTextParts.push(e(k(text), text)),
                                (text = ''))
                              : (text = (File.isMac ? 'file://' : 'file:///') + text),
                            quoteCharacter + encodeURI(text) + quoteCharacter
                          );
                        }
                        return (
                          (stylesheetPath = L(stylesheetPath).replace(/^file:\/\/?/, '')),
                          (cssText = (cssText || '')
                            .replace(/@charset[^;\n]+;?/g, '')
                            .replace(/@font\-face\s*{[^}]+}\s*\n/g, '')
                            .replace(
                              /(^|;|\n)[\s]*@import([^;\n]+)(;|$|\n)/g,
                              function (text, unusedParameter2) {
                                var quotedUrl = (/['"]([^"']+)['"]/.exec(text) || [])[0];
                                return quotedUrl ? text.replace(quotedUrl, o(quotedUrl)) : text;
                              },
                            )
                            .replace(/url\([^:)]+\)/gi, function (textSlice) {
                              return (
                                'url(' +
                                o((textSlice = textSlice.substring(4, textSlice.length - 1))) +
                                ')'
                              );
                            })),
                          (cssText = localTextParts.join('\n') + cssText)
                        );
                      })(stylesheetText, stylesheetPath)),
                      item,
                      linkedStyles,
                    ),
                    stylesheetText
                  );
                })
                .join('\n')),
                (regex = ['(base\\.css)']),
                themeCss || regex.push('(theme)'),
                hasCodeBlocks && regex.push('(codemirror)'),
                hasMermaid && regex.push('(mermaid)'),
                (regex = new RegExp(regex.join('|'), 'i'));
              for (var itemIndex = 0; itemIndex < document.styleSheets.length; itemIndex++)
                if (
                  b((stylesheet = document.styleSheets[itemIndex]).href) &&
                  (v(u(stylesheet), (stylesheet.href.match(/([^//\\]+)\.css$/) || [])[1]),
                  /themes/.exec(stylesheet.href))
                )
                  try {
                    var currentText = L(stylesheet.href),
                      includeStylesheetPath = decodeURI(
                        currentText.replace(File.isWin ? /^[\w_-]+:[\/]+/ : /^[\w_-]+:\/\/?/, ''),
                      );
                    M(k(includeStylesheetPath), void 0, includeStylesheetPath).map((item) =>
                      w(item),
                    );
                  } catch (currentError) {}
              return (
                textParts.push(...linkedStyles),
                themeCss && currentTextParts.push(themeCss),
                currentTextParts.join('\n')
              );
            })()),
          hasMermaid && exportOptions.exportTheme && !noStyle)
        ) {
          var exportThemeCss = themeCss;
          exportThemeCss ||
            [`${exportOptions.exportTheme}.css`, `${exportOptions.exportTheme}.user.css`].map(
              (item) => {
                exportThemeCss += (function e(stylesheetPath) {
                  importCount++;
                  var stylesheetText = k(stylesheetPath);
                  if (importCount > 10) return stylesheetText;
                  var items = [];
                  return (
                    M(stylesheetText, items, stylesheetPath),
                    items.forEach(function (text) {
                      /^file:\/\//.exec(text) &&
                        (stylesheetText = e(text.replace(/^file:\/\//, '')) + stylesheetText);
                    }),
                    stylesheetText
                  );
                })(T(item).replace('file://', ''));
              },
            ),
            (collectionOptions.mermaidSVGs =
              await editor.diagrams.mermaidSvgForExportTheme(exportThemeCss));
        }
        return (function (bodyHtml, documentTitle) {
          footnotes.length &&
            (bodyHtml +=
              "<div class='footnotes-area' " +
              (forPrint ? 'data-breakpage' : '') +
              ' ><hr/>' +
              S(footnotes) +
              '</div>');
          var printScript = forPrint
              ? "<script> window.setBreakPage = function(b){var node = document.querySelectorAll('[data-breakpage]'); for(var i=0;i<node.length;i++){node[i].style.pageBreakBefore = b ? 'always':'auto' } return node[0] && node[0].style.pageBreakBefore};<\/script>"
              : '',
            platformClass = forPrint ? (File.isMac ? 'is-mac' : 'is-node') : '',
            fontSize = exportOptions.fontSize || document.body.parentElement.style.fontSize || '';
          fontSize &&
            ('number' == typeof fontSize &&
              ((fontSize = `${fontSize}px`), (exportOptions.fontSize = fontSize)),
            (fontSize = " style='font-size:" + fontSize + " !important'")),
            forPrint &&
              File.isMac &&
              (printScript += '<script>(' + b.toString() + ')();<\/script>'),
            forPrint &&
              (printScript += '<script>(' + fitExportedTables.toString() + ')();<\/script>');
          var headContent = A(exportOptions.appendHead),
            extraHeadContent = A(exportOptions.appendHeadExtra);
          (headContent[0] = headContent[0] + extraHeadContent[0]),
            (headContent[1] =
              headContent[1] || extraHeadContent[1]
                ? ''
                : `<title>${utilities.escape(documentTitle || '')}</title>`);
          var bodyAppendix = A(exportOptions.appendBody)[0] + A(exportOptions.appendBodyExtra)[0];
          if (noStyle)
            return (
              `<!doctype html>\n<html>\n<head>\n<meta charset='UTF-8'><meta name='viewport' content='width=device-width initial-scale=1'>\n${headContent[1]}\n${headContent[0]}</head>\n<body>` +
              bodyHtml +
              `${bodyAppendix}</body>\n</html>`
            );
          var currentTextParts = ['marklyra-export'];
          forImage
            ? (currentTextParts.push('for-image'),
              v(' ::-webkit-scrollbar {display: none;} ', 'for-image'))
            : forPrint &&
              (currentTextParts.push('marklyra-print'),
              v(
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
                        ('none' !== content && content) ||
                          localTextParts.push(
                            `.marklyra-export ${headingTag}::after {content: "";display: block;height: 100px;margin-bottom: -100px;}`,
                          );
                      }
                    }
                  }
                  return localTextParts.join('\n');
                })(),
                'for-print',
              )),
            document.querySelector('mjx-container') &&
              (v(MathJax.svgStylesheet().innerHTML, 'mathjax'),
              forImage ||
                v(
                  'mjx-container[jax="SVG"] path[data-c], mjx-container[jax="SVG"] use[data-c] {\n\t\t\t\t\t\t\tstroke-width: 0;\n\t\t\t\t\t\t}',
                  'mathjax-ni',
                ));
          var paddingLeft = window.getComputedStyle(document.querySelector('ol, ul')).paddingLeft;
          parseInt(paddingLeft) <= 40 && v('ol, ul {padding-left: 40px}', 'lp'),
            File.isMac
              ? v(
                  ' @media print { @page {margin: 0 0 0 0;} body.marklyra-export {padding-left: 0; padding-right: 0;} #write {padding:0;}}',
                  'mac-print',
                )
              : exportOptions['paper.margin'] &&
                ('custom' === exportOptions['paper.margin']
                  ? v(
                      'body.marklyra-export {padding-left: $2mm; padding-right: $4mm;} #write {max-width: initial;}}'
                        .replace('$2', F(exportOptions['paper.marginLeft'], '16'))
                        .replace('$4', F(exportOptions['paper.marginRight'], '16')),
                      'mac-margin',
                    )
                  : v(
                      'body.marklyra-export {padding-left: 16mm; padding-right: 16mm;} #write {max-width: initial;}}',
                      'electron-margin',
                    )),
            File.option.preLinebreakOnExport ||
              v(
                ' .marklyra-export li, .marklyra-export p, .marklyra-export,  .footnote-line {white-space: normal;} h1,h2,h3,h4,h5 {white-space:pre-line}',
                'preLinebreakOnExport',
              ),
            File.option.indentFirstLine && (platformClass += ' first-line-indent'),
            document.body.classList.contains('os-windows') &&
              (currentTextParts.push('os-windows'),
              File.option.monocolorEmoji && currentTextParts.push('monocolor-emoji')),
            extraCss && v(extraCss, 'extraCSS');
          var sidebarHtml = '';
          return (
            exportOptions.sidebar &&
              ((sidebarHtml = (function () {
                editor.library.outline.updateOutlineHtml(editor.nodeMap.toc, !0);
                var outlineHtml = jquery('#outline-content').html();
                if (!outlineHtml || jquery('#outline-content').find('.outline-item').length <= 1)
                  return '';
                var sidebarElement = jquery(
                  "<div class='marklyra-export-sidebar'><div class='outline-content'>" +
                    outlineHtml +
                    '</div></div>',
                );
                return (
                  sidebarElement.find('.outline-label').each(function () {
                    this.classList.contains('outline-active') &&
                      (this.classList.remove('outline-active'),
                      this.parentElement.classList.remove('outline-item-active')),
                      this.setAttribute(
                        'href',
                        '#' + collectionOptions.anchorMap[this.getAttribute('data-ref')],
                      ),
                      this.removeAttribute('data-ref'),
                      (this.outerHTML = this.outerHTML
                        .replace(/^<span/, '<a')
                        .replace(/<\/span>$/, '</a>'));
                  }),
                  sidebarElement.find('.outline-item-signle').removeClass('outline-item-signle'),
                  document.body.classList.contains('no-collapse-outline') &&
                    sidebarElement.find('.outline-item-single').removeClass('outline-item-single'),
                  sidebarElement[0].outerHTML
                );
              })()) &&
                (currentTextParts.push('marklyra-export-show-outline'),
                document.body.classList.contains('no-collapse-outline')
                  ? currentTextParts.push('marklyra-export-no-collapse-outline')
                  : currentTextParts.push('marklyra-export-collapse-outline')),
              (printScript += _())),
            console.debug(textParts),
            `<!doctype html>\n<html${fontSize}>\n<head>\n<meta charset='UTF-8'><meta name='viewport' content='width=device-width initial-scale=1'><style type='text/css'>html {overflow-x: initial !important;}</style>\n${textParts.join('\n')}\n${headContent[0]}\n${headContent[1]}\n</head>\n<body class='${currentTextParts.join(' ')}'><div class='marklyra-export-content'>\n${sidebarHtml}<div id='write' ${forPrint ? "style='top:auto'" : ''} class='${platformClass}'>${bodyHtml}</div></div>\n${printScript}${bodyAppendix}</body>\n</html>`
          );
        })(this.exportCollection(documentMap.blocks, footnotes, collectionOptions), documentTitle);
      }
      cleanUpTempFiles() {}
      async exportWithCommand(option) {
        var outputPath = '';
        if (
          ('saveFolder' == option.saveDialog &&
            (outputPath = await fileIntegration.showExportDialog(
              void 0,
              Object.assign({ selectFolder: !0 }, option),
            )),
          'saveFile' == option.saveDialog)
        ) {
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
        var commandText = F.processExportVariables(option.command || '', {
          outputPath: outputPath,
        });
        if ((console.debug('run export command ' + commandText), !outputPath && option.saveDialog))
          return document.body.classList.remove('marklyra-show-notification'), null;
        var cwd =
          fileIntegration.getCurrentFileFolderPath() || window._options.documentsPath || '/';
        return (
          File.isNode && pandocExport.customExport(outputPath, commandText, cwd, option),
          this.recordLastExport(option, outputPath),
          { output: outputPath, args: commandText || '', cwd: cwd, option: option }
        );
      }
    }
    function S(items) {
      return items
        .map(function (item) {
          return "<div class='footnote-line'>" + item.join('') + '</div>';
        })
        .join('\n');
    }
    (F.processExportVariables = x), (F.onExportSuccess = w), (moduleRecord.exports = F);
  },
);
