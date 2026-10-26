// export/print-and-images.
export default function initializeExportPrintAndImages(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(renderHeaderFooterText, 'name', { value: 'c', configurable: true });
  Object.defineProperty(valueOrFallback, 'name', { value: 'm', configurable: true });
  Object.defineProperty(disposePrintCapture, 'name', { value: 'S', configurable: true });

  if (!this) {
    self;
  }
  var dialogs = requireModule('ui/dialogs'),
    utilities = requireModule('shared/utilities'),
    fileIntegration = requireModule('host/file-integration');
  const pixelsPerPoint = 96 / 72,
    inchesPerPoint = 1 / 72;
  const getMarginPoints = Object.defineProperty(
    (exportOptions, marginName) => {
      if ('custom' === exportOptions['paper.margin']) {
        const millimeters = exportOptions['paper.' + marginName];
        if (millimeters) {
          return Math.round((72 / 25.4) * (millimeters - 0));
        }
      }
      return (72 / 25.4) * 16;
    },
    'name',
    { value: 'l', configurable: true },
  );
  function renderHeaderFooterText(templateText, exportOptions, pageno, totalpages) {
    if (templateText) {
      return File.editor.export.processExportVariables(
        templateText,
        Object.assign(
          {
            title: fileIntegration
              .getFileNameFromPath(File.bundle.filePath || '')
              .replace(/\..+$/, ''),
            author: '',
          },
          exportOptions,
        ),
        { pageno: pageno, totalpages: totalpages, pagecount: totalpages },
      );
    } else {
      return '';
    }
  }
  moduleExports.renderHeaderFooterText = renderHeaderFooterText;
  const addPdfHeaderFooter = Object.defineProperty(
    async function (pdfDocument, exportOptions) {
      const pages = pdfDocument.getPages();
      var topMargin = getMarginPoints(exportOptions, 'marginTop'),
        bottomMargin = getMarginPoints(exportOptions, 'marginBottom'),
        leftMargin = getMarginPoints(exportOptions, 'marginLeft') || 0,
        rightMargin = getMarginPoints(exportOptions, 'marginRight') || 0;
      if (leftMargin == rightMargin) {
        rightMargin = leftMargin = 0;
      }
      var pageWidth = pages[0].getWidth();
      const header = exportOptions.header,
        footer = exportOptions.footer,
        [headerPages, footerPages] = await (async function (headerTemplate, footerTemplate, pages) {
          Object.defineProperty(createHeaderFooterParagraph, 'name', {
            value: 'f',
            configurable: true,
          });
          Object.defineProperty(renderHeaderFooterPages, 'name', {
            value: 'm',
            configurable: true,
          });

          function createHeaderFooterParagraph(contentHtml, heightPoints) {
            var { fontFamily: fontFamily, color: textColor } = exportOptions.textStyles || {};
            if (fontFamily) {
              fontFamily = utilities.escapeForPreWrap(fontFamily);
            }
            var heightPixels = Math.ceil(heightPoints * pixelsPerPoint);
            return `<p style="font-size:12px;text-align:center;margin:0;padding:0 ${rightMargin}px 0 ${leftMargin}px;height:${heightPixels}px;line-height:${heightPixels}px;page-break-before:avoid;page-break-after:always;font-family:${fontFamily || 'inherit'};color:${textColor || 'inherit'};"><span style="display: inline-block;vertical-align: middle;">${utilities.escape(contentHtml) || '<br/>'}</span></p>`;
          }
          async function renderHeaderFooterPages(templateText, heightPoints, sectionName) {
            for (var textParts = [], pageIndex = 0; pageIndex < pages.length; pageIndex++) {
              let pageHtml = renderHeaderFooterText(
                templateText,
                exportOptions,
                pageIndex + 1,
                pages.length,
              );
              textParts.push(createHeaderFooterParagraph(pageHtml, heightPoints));
            }
            var sectionHtml = `<html style="margin:0;padding:0;"><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:${exportOptions.textStyles.bgColor || 'transparent'};">${textParts.join('\n')}</body></html>`;
            return await (async function (htmlText, heightPoints, taskLabel) {
              var temporaryName = utilities.tempString() + '.html',
                normalizedPath = reqnode('path').normalize(
                  File.option.tempPath + '/' + temporaryName,
                );
              await reqnode('fs-extra').outputFile(normalizedPath, htmlText);
              var [pdfBytes] = await JSBridge.invoke('export.printToPDF', normalizedPath, {
                taskLabel: taskLabel,
                printBackground: true,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                pageSize: {
                  width: pageWidth * inchesPerPoint,
                  height: heightPoints * inchesPerPoint,
                },
              });
              let sectionPages = (await PDFLib.PDFDocument.load(pdfBytes)).getPages();
              return await pdfDocument.embedPages(sectionPages);
            })(sectionHtml, heightPoints, sectionName);
          }
          return [
            await renderHeaderFooterPages(headerTemplate, topMargin, 'header'),
            await renderHeaderFooterPages(footerTemplate, bottomMargin, 'footer'),
          ];
        })(header, footer, pages);
      for (var itemIndex = 0; itemIndex < pages.length; itemIndex++) {
        const page = pages[itemIndex];
        if (headerPages) {
          page.drawPage(headerPages[itemIndex], {
            x: 0,
            y: Math.floor(page.getHeight() - topMargin),
          });
        }
        if (footerPages) {
          page.drawPage(footerPages[itemIndex], { x: 0, y: 0 });
        }
      }
      setPdfMetadata(pdfDocument, exportOptions);
      return await pdfDocument.save();
    },
    'name',
    { value: 'd', configurable: true },
  );
  var setPdfMetadata = Object.defineProperty(
      function (pdfDocument, metadata) {
        pdfDocument.setTitle(metadata.title || '');
        pdfDocument.setSubject(metadata.subject || '');
        pdfDocument.setAuthor(metadata.author || '');
        pdfDocument.setCreator(metadata.creator || 'MarkLyra');
        pdfDocument.setProducer('MarkLyra, Electron');
      },
      'name',
      { value: 'u', configurable: true },
    ),
    processExportedPdf = Object.defineProperty(
      async function (exportError, pdfBytes, exportOptions) {
        Object.defineProperty(reportPdfBookmarkFailure, 'name', { value: 's', configurable: true });

        var inputPdfBytes = Buffer.from(pdfBytes),
          exportResult = { data: pdfBytes };
        try {
          var localSettings = File.editor.localSettingBridge.getCalculatedSetting();
          exportOptions = Object.assign(exportOptions, localSettings);
        } catch (error) {
          console.sendError(error);
        }
        function reportPdfBookmarkFailure(processingError) {
          exportResult.warning =
            'Failed to add book to exported PDF\n' +
            (processingError.message || processingError.details);
          dialogs.showNotification(
            `<span class='marklyra-pdf-warning'>${$.localize.getString('[Warning] Failed to attach bookmark for PDF file.', 'Panel')}</span>`,
            true,
          );
          exportResult.data = inputPdfBytes;
          return exportResult;
        }
        if (exportError) {
          return reportPdfBookmarkFailure(exportError);
        }
        try {
          const headingPositions = (function (pdfDocument) {
            const pages = pdfDocument.getPages(),
              length = pages.length,
              pageHeight = pages[0].getHeight(),
              anchorPositions = {};
            console.debug('total PDF page number ' + length);
            const subtypeKey = PDFLib.PDFName.of('Subtype'),
              rectangleKey = PDFLib.PDFName.of('Rect'),
              uriKey = PDFLib.PDFName.of('URI'),
              actionKey = PDFLib.PDFName.of('A');
            for (var itemIndex = 0; itemIndex < length; itemIndex++) {
              const annotations = pages[itemIndex].node.Annots(),
                annotationCount = annotations ? annotations.size() : 0;
              for (var annotationIndex = 0; annotationIndex < annotationCount; annotationIndex++) {
                try {
                  const annotation = annotations.lookup(annotationIndex, PDFLib.PDFDict),
                    subtype = annotation.get(subtypeKey);
                  if (subtype && '/Link' === subtype.asString()) {
                    const action = annotation.get(actionKey);
                    if (!action) {
                      continue;
                    }
                    const targetUri = action.get(uriKey).asString(),
                      bounds = annotation.get(rectangleKey).asRectangle();
                    var match;
                    if ((match = /^af:\/\/(.+)$/.exec(targetUri || ''))) {
                      anchorPositions[match[1]] = [
                        itemIndex + 1,
                        pageHeight - bounds.height - bounds.y,
                      ];
                    }
                  }
                } catch (currentError) {
                  console.sendLog(currentError, true);
                }
              }
            }
            return anchorPositions;
          })(await PDFLib.PDFDocument.load(pdfBytes));
          console.debug('got anchor map');
          return await new Promise((resolvePromise, rejectPromise) => {
            var fileReaderInstance = new FileReader();
            fileReaderInstance.onloadend = async function () {
              var processedBytes = Buffer.from(new Uint8Array(fileReaderInstance.result)),
                exportResult = {};
              try {
                processedBytes =
                  (await addPdfHeaderFooter(
                    await PDFLib.PDFDocument.load(processedBytes),
                    exportOptions,
                  )) || processedBytes;
              } catch (currentError) {
                exportResult.warning =
                  'Failed to add header / footer.\n' +
                  (currentError.message || currentError.details);
              }
              exportResult.data = processedBytes;
              resolvePromise(exportResult);
            };
            fileReaderInstance.onerror = fileReaderInstance.onabort = (readError) => {
              rejectPromise(readError);
            };
            fileReaderInstance.readAsArrayBuffer(
              (function (headingPositions, pdfBytes, metadata) {
                metadata = metadata || {};
                var tPDFAnalystInstance = new TPDFAnalyst(),
                  tPDFOutLineMakerInstance = new TPDFOutLineMaker(),
                  headings = File.editor.library.outline.getHeaderMatrix(true);
                tPDFAnalystInstance.LoadFromStream(pdfBytes);
                var keywords = metadata.keywords || metadata.tags || [];
                if ('string' == typeof keywords) {
                  keywords = [keywords];
                }
                tPDFOutLineMakerInstance.Info.Keywords = keywords.join(', ');
                var CreationDate = new Date()
                  .toISOString()
                  .replace(/\.\d+Z$/, '')
                  .replace(/[-T:]/g, '');
                tPDFOutLineMakerInstance.Info.CreationDate = CreationDate;
                tPDFOutLineMakerInstance.Info.ModDate = CreationDate;
                tPDFOutLineMakerInstance.View.PageMode = TPDFPageMode.pmUseOutlines;
                Object.defineProperty(
                  function appendPdfOutlineEntries(
                    parentOutline,
                    parentDepth,
                    startIndex,
                    endIndex,
                  ) {
                    for (
                      var currentDepth = 7, currentOutline = null, itemIndex = startIndex;
                      itemIndex < endIndex;
                      itemIndex++
                    ) {
                      var destination,
                        heading = headings[itemIndex],
                        headingDepth = heading[0];
                      if (7 == currentDepth) {
                        currentDepth = headingDepth;
                      }
                      if (headingDepth <= parentDepth) {
                        return itemIndex;
                      }
                      if (headingDepth > currentDepth) {
                        itemIndex =
                          appendPdfOutlineEntries(
                            currentOutline,
                            currentDepth,
                            itemIndex,
                            endIndex,
                          ) - 1;
                      } else {
                        if (!(destination = headingPositions[heading[2]])) {
                          continue;
                        }
                        currentOutline = parentOutline
                          ? parentOutline.AddChild(
                              heading[1],
                              destination[0],
                              destination[1],
                              '',
                              false,
                              false,
                              null,
                            )
                          : tPDFOutLineMakerInstance.OutLine.AddRoot(
                              heading[1],
                              destination[0],
                              destination[1],
                              '',
                              false,
                              false,
                              null,
                            );
                      }
                    }
                    return endIndex;
                  },
                  'name',
                  { value: 't', configurable: true },
                )(null, 0, 0, headings.length);
                return tPDFOutLineMakerInstance.Save(tPDFAnalystInstance);
              })(headingPositions, pdfBytes, exportOptions),
            );
          });
        } catch (localError) {
          return reportPdfBookmarkFailure(localError);
        }
      },
      'name',
      { value: 'h', configurable: true },
    ),
    printViewCache = null,
    writeTemporaryHtml = Object.defineProperty(
      async (htmlText) => {
        var temporaryName = new Date() - 0 + '-' + Math.random() + '.html',
          normalizedPath = reqnode('path').normalize(File.option.tempPath + '/' + temporaryName);
        await reqnode('fs-extra').outputFile(normalizedPath, htmlText);
        return normalizedPath;
      },
      'name',
      { value: 'f', configurable: true },
    );
  moduleExports.makeTempFile = writeTemporaryHtml;
  moduleExports.print = () => {
    File.editor.export.showExportNotification();
    File.editor.export.beforeExport(true);
    (async function (disableLigatures) {
      var printHtml = await File.editor.export.exportToHTML({
          forPrint: true,
          extraCss: disableLigatures ? 'body {font-variant-ligatures: no-common-ligatures;}' : '',
        }),
        htmlPath = await writeTemporaryHtml(printHtml),
        printViewPromise = JSBridge.invoke('export.genPrintView', htmlPath, printViewCache);
      printViewCache = null;
      return printViewPromise;
    })(true).then((result) => {
      setTimeout(() => {
        JSBridge.invoke('export.print', result, {});
        document.body.classList.remove('marklyra-show-notification');
      }, 300);
      Analytics.record('print');
    });
  };
  function valueOrFallback(value, fallbackValue) {
    if (void 0 === value || null === value || '' === value) {
      return fallbackValue;
    } else {
      return value;
    }
  }
  var workerInstance, winId;
  moduleExports.exportPDF = async function (exportOptions) {
    Object.defineProperty(handleExportFailure, 'name', { value: 'c', configurable: true });

    var timerId, promiseInstance;
    exportOptions = exportOptions || {};
    var htmlOptions = { forPrint: true };
    Object.assign(htmlOptions, exportOptions);
    var htmlText = await File.editor.export.exportToHTML(htmlOptions),
      temporaryName = new Date() - 0 + '-' + Math.random() + '.html',
      normalizedPath = reqnode('path').normalize(File.option.tempPath + '/' + temporaryName);
    function handleExportFailure(errorMessage) {
      if (errorMessage) {
        dialogs.showNotificationWithTitle(
          $.localize.getString('Export Failed', 'Panel'),
          errorMessage,
          $.localize.getString('Support Document'),
          function () {
            const supportDomain = File.option.useMirrorInCN ? 'marklyraio.cn' : 'marklyra.io';
            JSBridge.showInBrowser(`https://support.${supportDomain}/Export/#trouble-shooting`);
          },
        );
      } else {
        document.body.classList.remove('marklyra-show-notification');
      }
      if (timerId) {
        clearTimeout(timerId);
      }
      promiseInstance = null;
    }
    await reqnode('fs-extra').outputFile(normalizedPath, htmlText);
    promiseInstance = new Promise(async (resolvePromise, rejectPromise) => {
      if (File.editor.export.beforeExport(true)) {
        await ((delay) =>
          new Promise((inputResolvePromise) => {
            setTimeout(inputResolvePromise, delay);
          }))(1900);
      }
      File.editor.export.showExportNotification();
      var pageSize = exportOptions.paper || 'A4';
      if ('custom' === pageSize) {
        pageSize = {
          width: (exportOptions['paper.custom'][0] || 210) * (1 / 25.4),
          height: (exportOptions['paper.custom'][1] || 297) * (1 / 25.4),
        };
      }
      var [pdfBytes, serializedStyles, errorMessage] = await JSBridge.invoke(
        'export.printToPDF',
        normalizedPath,
        {
          taskLabel: 'content',
          printBackground: true,
          margins: {
            left: 0,
            right: 0,
            top:
              ('custom' === exportOptions['paper.margin']
                ? valueOrFallback(exportOptions['paper.marginTop'], 16)
                : 16) *
              (1 / 25.4),
            bottom:
              ('custom' === exportOptions['paper.margin']
                ? valueOrFallback(exportOptions['paper.marginBottom'], 16)
                : 16) *
              (1 / 25.4),
          },
          pageSize: pageSize,
        },
      );
      exportOptions.textStyles = serializedStyles ? JSON.parse(serializedStyles) : null;
      if (pdfBytes) {
        resolvePromise(await processExportedPdf(null, pdfBytes, exportOptions));
      } else {
        rejectPromise('Failed to export as PDF. ' + errorMessage);
      }
    });
    var outputPath = await fileIntegration.showExportDialog('pdf', exportOptions);
    console.sendLog('export PDF to ' + outputPath);
    if (outputPath) {
      File.editor.export.recordLastExport(exportOptions, outputPath);
      promiseInstance.then(function (inputPromiseInstance) {
        File.fs.writeFile(outputPath, inputPromiseInstance.data, function (error) {
          if (error) {
            handleExportFailure(error);
          } else {
            if (!$('#md-notification .marklyra-pdf-warning').length) {
              File.editor.export.onExportSuccess(
                'pdf',
                outputPath,
                exportOptions,
                '',
                inputPromiseInstance.warning,
              );
            }
          }
        });
      }, handleExportFailure);
    } else {
      handleExportFailure();
    }
  };
  var currentPath,
    captureError,
    pageHeight = File.isWin ? 8e3 : 960,
    pageBatchLimit = File.isWin ? 5 : 40,
    maxCaptureHeight = pageHeight * pageBatchLimit,
    captureScale = 1;
  function disposePrintCapture(hideNotification) {
    currentPath = null;
    if (winId) {
      JSBridge.invoke('export.destroyPrintView', winId);
      winId = null;
    }
    if (workerInstance) {
      workerInstance.postMessage('terminate');
      workerInstance.terminate();
      workerInstance = null;
    }
    if (hideNotification) {
      document.body.classList.remove('marklyra-show-notification');
    }
  }
  window.releaseCaptureWin_ = disposePrintCapture;
  moduleExports.exportToImage = async (exportOptions) => {
    Object.defineProperty(handleCaptureFailure, 'name', { value: 'a', configurable: true });

    (exportOptions = Object.assign(
      { imageWidth: 640, imageFontSize: '24px' },
      exportOptions || {},
      {
        forPrint: true,
        forImage: true,
      },
    )).fontSize = exportOptions.imageFontSize;
    if (exportOptions.useThemeFontSize) {
      exportOptions.fontSize = void 0;
    }
    var currentTotalHeight,
      imageWidth = exportOptions.imageWidth,
      index = 0;
    function handleCaptureFailure(stack) {
      console.sendError(stack.stack || stack, 'warning');
      if (currentPath) {
        dialogs.showErrorDialog('Export Failed', stack.stack || stack);
      }
      if (null === captureError) {
        captureError = stack.stack || stack;
      }
      disposePrintCapture(true);
    }
    disposePrintCapture(true);
    captureError = null;
    File.editor.store(true);
    File.editor.export.showExportNotification();
    var htmlText = await File.editor.export.exportToHTML(exportOptions);
    (workerInstance = new Worker(
      (window.debugMode ? 'lib' : 'lib.asar') + '/image-worker.js',
    )).onmessage = function (workerMessage) {
      if (workerMessage.data.success) {
        File.editor.export.onExportSuccess('image', currentPath, exportOptions);
        disposePrintCapture(true);
      } else {
        handleCaptureFailure(workerMessage.data.error);
      }
    };
    var temporaryName = new Date() - 0 + '-' + Math.random() + '.html',
      normalizedPath = reqnode('path').normalize(File.option.tempPath + '/' + temporaryName);
    reqnode('fs-extra')
      .outputFile(normalizedPath, htmlText)
      .then(() => {
        JSBridge.invoke('export.prepareImageCapture', normalizedPath, {
          imageWidth: imageWidth,
          quality: (exportOptions.quality || 0) - 0,
        })
          .then((result) => {
            if (result) {
              winId = result.winId;
              currentTotalHeight = result.totalHeight;
              pageHeight = result.pageHeight || pageHeight;
              captureScale = result.scale || 1;
              if (currentTotalHeight > maxCaptureHeight) {
                handleCaptureFailure('Generated Image too Large');
              } else {
                Object.defineProperty(
                  async function capturePageSegment(inputPageHeight) {
                    var currentPageHeight = currentTotalHeight - inputPageHeight;
                    if (currentPageHeight > pageHeight) {
                      currentPageHeight = pageHeight;
                    }
                    if (workerInstance) {
                      var captureResult = await JSBridge.invoke(
                        'export.captureImage',
                        winId,
                        inputPageHeight,
                        {
                          imageWidth: imageWidth,
                          pageHeight: currentPageHeight,
                          quality: (exportOptions.quality || 0) - 0,
                        },
                      );
                      if (null != captureResult && winId) {
                        var { newScrollHeight: totalHeight, data: buffer } =
                          JSON.parse(captureResult);
                        if (totalHeight > currentTotalHeight + 100) {
                          workerInstance.postMessage({
                            action: 'updateTotalHeight',
                            totalHeight: totalHeight,
                          });
                          currentTotalHeight = totalHeight;
                        }
                        workerInstance.postMessage({
                          action: 'addImage',
                          buffer: buffer,
                          index: index,
                          position: {
                            width: imageWidth * captureScale,
                            offset: inputPageHeight * captureScale,
                          },
                          totalHeight: currentTotalHeight * captureScale,
                          total: Math.ceil(currentTotalHeight / pageHeight),
                        });
                        if (inputPageHeight + currentPageHeight < currentTotalHeight) {
                          index++;
                          capturePageSegment((inputPageHeight += currentPageHeight));
                        }
                      } else {
                        handleCaptureFailure('');
                      }
                    }
                  },
                  'name',
                  { value: 'i', configurable: true },
                )(0);
              }
            } else {
              handleCaptureFailure('Failed to create image view for web content');
            }
          })
          .catch((error) => {
            disposePrintCapture(true);
          });
      });
    var path = await fileIntegration.showExportDialog('png', exportOptions, [
      { name: 'PNG', extensions: ['png'] },
      { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
    ]);
    if (!path) {
      return disposePrintCapture(true);
    }
    File.editor.export.recordLastExport(exportOptions, path);
    currentPath = path;
    if (workerInstance) {
      workerInstance.postMessage({ action: 'setPath', path: path });
    } else {
      dialogs.showErrorDialog('Export Failed', captureError);
    }
  };
}
