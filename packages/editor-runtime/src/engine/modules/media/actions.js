// media/actions.
// SystemJS module 2a. Dependencies: e, 13, 11, 34, 35, 30, 3f, 27.
$__System.registerDynamic(
  '2a',
  ['e', '13', '11', '34', '35', '30', '3f', '27'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var jquery = requireModule('e'),
      utilities = (requireModule('13').Node, requireModule('11')),
      assetStorage = requireModule('34'),
      recovery = requireModule('35'),
      userOperations = requireModule('30'),
      htmlParser = requireModule('3f');
    requireModule('27').map;
    function c(domNode, inlineStyles, opaqueBackground) {
      var background,
        clonedNode = domNode.cloneNode(!0),
        computedStyle = window.getComputedStyle(domNode);
      if (
        (domNode.querySelector("[*|href='#raphael-marker-block']") &&
          !domNode.querySelector('#raphael-marker-block') &&
          clonedNode
            .querySelector('defs')
            .appendChild(document.querySelector('path#raphael-marker-block').cloneNode()),
        inlineStyles &&
          (function e(sourceElement, destinationElement) {
            function i(collection) {
              for (
                var items = [], length = collection.length, itemIndex = 0;
                itemIndex < length;
                itemIndex++
              )
                items.push(collection[itemIndex]);
              return items;
            }
            var currentComputedStyle = window.getComputedStyle(sourceElement);
            [
              'backgroundColor',
              'color',
              'fill',
              'stroke',
              'strokeWidth',
              'opacity',
              'stroke-dasharray',
              'fontSize',
              'fontFamily',
              'textAnchor',
              'textSize',
              'padding',
              'margin',
            ].forEach(function (item) {
              destinationElement.style[item] = currentComputedStyle[item];
            });
            var clonedChildren = i(destinationElement.children || []);
            clonedChildren.length &&
              i(sourceElement.children || []).forEach(function (item, itemIndex) {
                e(item, clonedChildren[itemIndex]);
              });
          })(domNode, clonedNode),
        domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName)
      ) {
        var bounds = domNode.getBoundingClientRect();
        (clonedNode.style.textAlign = 'center'),
          clonedNode.setAttribute('height', bounds.height + 8),
          clonedNode.setAttribute('width', bounds.width + 8);
      }
      if (
        (clonedNode.style.color || (clonedNode.style.color = computedStyle.color),
        computedStyle.getPropertyValue &&
          (background = window.getComputedStyle(document.body).backgroundColor),
        !clonedNode.style.background &&
          ((clonedNode.style.background = computedStyle.backgroundColor),
          'rgba(0, 0, 0, 0)' !== computedStyle.backgroundColor &&
            (background = clonedNode.style.background),
          background))
      ) {
        var match = background.match(/\d+/gi);
        if (match.length)
          (299 * match[0] + 587 * match[1] + 114 * match[2]) / 256e3 < 0.5
            ? ((clonedNode.style.background = background),
              jquery(clonedNode)
                .find("[fill='var(--bg-color)']")
                .attr('fill', background || 'none'))
            : opaqueBackground
              ? ((clonedNode.style.background = 'white'),
                jquery(clonedNode).find("[fill='var(--bg-color)']").attr('fill', 'white'))
              : ((clonedNode.style.background = ''),
                jquery(clonedNode).find("[fill='var(--bg-color)']").attr('fill', 'none'));
      }
      return clonedNode;
    }
    function d(domNode, inlineStyles, rawMarkup, opaqueBackground) {
      var bounds = domNode.getBoundingClientRect(),
        element = c(domNode, inlineStyles, opaqueBackground);
      domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName
        ? (element.setAttribute('height', 2 * (bounds.height + 8)),
          element.setAttribute('width', 2 * (bounds.width + 8)))
        : element.setAttribute('height', bounds.bottom - bounds.top);
      var svgMarkup = h(element.outerHTML, !1);
      return (
        inlineStyles || (svgMarkup = u(svgMarkup)),
        rawMarkup ? svgMarkup : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup)
      );
    }
    function u(svgMarkup) {
      var textColor,
        computedStyle = window.getComputedStyle(document.documentElement);
      return (svgMarkup = utilities.replaceAll(
        svgMarkup,
        'var(--text-color)',
        (unusedParameter1) => (
          textColor || (textColor = computedStyle.getPropertyValue('--text-color')), textColor
        ),
      ));
    }
    function h(text, preserveXlink) {
      return (
        (text = text
          .replace(/xmlns:NS\d+/gi, 'xmlns:xlink')
          .replace(/NS\d+:href/gi, 'xlink:href')
          .replace(/NS\d+:space/gi, 'xml:space')
          .replace(/NS\d+:/gi, '')
          .replace(/<br([^>]*)>/g, '<br/>')
          .replace(
            /<img([^>]*)>/g,
            (unusedParameter1, imageAttributes) => `<img ${imageAttributes} />`,
          )),
        preserveXlink || (text = text.replace(/xlink:/g, '')),
        text
      );
    }
    var temporaryImageSequence = 0;
    function f(element, extension) {
      var html =
          "<html style='margin:0;padding:0;'><head><meta charset='UTF-8'><style>" +
          (function () {
            var diagramCss = '';
            for (var stylesheet of document.styleSheets)
              try {
                if (
                  stylesheet.href &&
                  stylesheet.href.indexOf('mermaid.css') > -1 &&
                  stylesheet.cssRules
                )
                  for (var cssRule of stylesheet.cssRules) diagramCss += cssRule.cssText || '';
                if (
                  stylesheet.href &&
                  stylesheet.href.indexOf('mermaid-zenuml.css') > -1 &&
                  stylesheet.cssRules
                )
                  for (var cssRule of stylesheet.cssRules) diagramCss += cssRule.cssText || '';
                if (
                  stylesheet.href &&
                  stylesheet.href.indexOf('mermaid.dark.css') > -1 &&
                  stylesheet.cssRules
                )
                  for (var cssRule of stylesheet.cssRules) diagramCss += cssRule.cssText || '';
              } catch (error) {}
            return diagramCss;
          })() +
          "</style></head><body style='margin:0;padding:0;'>$1</body></html>",
        bounds = element.getBoundingClientRect(),
        width = bounds.width;
      return (
        element.querySelector('[data-v-app]') &&
          (width = element.querySelector('[data-v-app]').getBoundingClientRect().width + 32),
        (bounds = { x: 0, y: 0, width: width, height: bounds.height }),
        (html = html.replace('$1', d(element, !0, !0))),
        JSBridge.invoke('controller.screenshotHTML', {
          html: html,
          rect: bounds,
          extension: extension || 'png',
        })
      );
    }
    function m(svgElement, inlineStyles, imageFormat, destination) {
      return new Promise((resolvePromise) => {
        var src = d(svgElement, inlineStyles, !1, 'jpeg' == imageFormat),
          imageInstance = new Image();
        (imageInstance.onerror = function (unusedParameter1) {
          resolvePromise('');
        }),
          (imageInstance.onload = function () {
            var canvasElement = document.createElement('canvas'),
              canvasContext = canvasElement.getContext('2d'),
              canvasratio = File.canvasratio,
              width = imageInstance.width,
              height = imageInstance.height;
            (canvasElement.width = width),
              (canvasElement.height = height),
              canvasratio > 1.1 &&
                ((canvasElement.width = width * canvasratio),
                (canvasElement.height = height * canvasratio),
                canvasContext.scale(canvasratio, canvasratio)),
              (canvasElement.style.width = width + 'px'),
              (canvasElement.style.height = height + 'px'),
              canvasContext.drawImage(imageInstance, 0, 0),
              setTimeout(function () {
                var imageBase64 = '';
                try {
                  imageBase64 = canvasElement
                    .toDataURL(`image/${imageFormat}`)
                    .replace(`data:image/${imageFormat};base64,`, '');
                } catch (error) {
                  console.warn(error);
                }
                !(function (imageBase64, imageFormat, destination, onSaved) {
                  if ('clipboard' === destination) return g(imageBase64), void onSaved();
                  if (File.isNode) {
                    var imageBytes = imageBase64;
                    reqnode('fs').writeFile(
                      destination,
                      imageBytes,
                      'base64',
                      function (inputError) {
                        inputError
                          ? (onSaved(''), console.sendError(inputError))
                          : onSaved(destination);
                      },
                    );
                  } else
                    File.isMac &&
                      ((imageBase64 = `data:image/${imageFormat};base64,` + imageBase64),
                      bridge.callHandler('images.savePNG', imageBase64, async function (from) {
                        from &&
                        destination &&
                        (await JSBridge.invoke('path.moveFile', { from: from, to: destination }))
                          ? onSaved(destination)
                          : onSaved('');
                      }));
                })(imageBase64, imageFormat, destination, resolvePromise);
              }, 100);
          }),
          (imageInstance.src = src);
      });
    }
    function g(path) {
      if (((path = 'data:image/png;base64,' + path), File.isNode)) {
        const nativeImage = reqnode('electron').nativeImage.createFromDataURL(path);
        reqnode('electron').clipboard.writeImage(nativeImage);
      } else
        bridge.callHandler('clipboard.writeImage', { path: path }, function () {
          callback();
        });
    }
    async function v(domNode, copyToClipboard) {
      if (domNode)
        return 'svg' == domNode.tagName
          ? await (async function (inputElement) {
              var path =
                copyToClipboard ||
                (await (File.isNode
                  ? JSBridge.invoke('dialog.showSaveDialog', {
                      properties: ['saveFile', 'showOverwriteConfirmation'],
                      title: jquery.localize.getString('Save', 'Menu'),
                      filters: [
                        { name: 'All Image Types', extensions: ['svg', 'png', 'jpg', 'jpeg'] },
                        { name: 'SVG', extensions: ['svg'] },
                        { name: 'PNG', extensions: ['png'] },
                        { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
                      ],
                    }).then(({ filePath: selectedPath }) => selectedPath)
                  : File.isMac
                    ? JSBridge.invoke('image.saveSVGDialog')
                    : void 0));
              if (path) {
                copyToClipboard && (path = 'clipboard');
                var element = inputElement.closest("[lang='mermaid']"),
                  currentElement = inputElement.closest('mjx-container');
                if (/\.svg$/.exec(path)) {
                  var content = u(h((inputElement = c(inputElement, element, !1)).outerHTML, !1));
                  if (File.isNode)
                    return new Promise((resolvePromise) => {
                      reqnode('fs').writeFile(path, content, 'utf8', resolvePromise);
                    });
                  if (File.isMac)
                    return JSBridge.invoke('image.saveSVG', { path: path, content: content });
                }
                var imageFormat = copyToClipboard || /\.png$/.exec(path) ? 'png' : 'jpeg';
                if (File.isNode || currentElement)
                  return await m(inputElement, element, imageFormat, path);
                if (File.isMac) {
                  var currentPath = await f(inputElement, imageFormat);
                  return copyToClipboard
                    ? (await JSBridge.invoke('clipboard.writeImage', { path: currentPath }), '')
                    : (await JSBridge.invoke('path.moveFile', { from: currentPath, to: path }))
                      ? path
                      : '';
                }
              }
            })(domNode)
          : await (async function (imageElement) {
              if (imageElement.src)
                if (File.isMac && /^(wk)?file:/.exec(imageElement.src)) {
                  var imagePath = utilities.absolutePathFrom(imageElement.src);
                  JSBridge.invoke('shell.showSaveImage', imagePath);
                } else JSBridge.invoke('shell.showDownload', imageElement.src);
            })(domNode);
    }
    moduleExports.copyAsHtml = function (inputElement) {
      var element = inputElement.closest("[lang='mermaid']"),
        currentElement = inputElement.closest('[cid]'),
        svgMarkup = u(h((inputElement = c(inputElement, element, !1)).outerHTML, !1)),
        markdownHtml = htmlParser
          .getMarkElemFromCurrentHtml(currentElement.outerHTML, File.editor)
          .html();
      userOperations.setClipboard(null, markdownHtml, svgMarkup);
    };
    const size = 31457280;
    async function b(mediaUrl) {
      var editor = File.editor;
      mediaUrl = /^(wk)*file:(\/\/)*/.exec(mediaUrl)
        ? utilities.absolutePathFrom(mediaUrl)
        : mediaUrl;
      var match = utilities.VIDEO_REG.exec(mediaUrl),
        currentMatch = utilities.AUDIO_REG.exec(mediaUrl),
        mediaName = utilities.getFileName(mediaUrl),
        currentFilePath = File.isWin ? '\\' : '/',
        assetsDirectory = File.bundle.filePath + currentFilePath + 'assets' + currentFilePath;
      var resolvedMediaPath = await (async function () {
        if (
          (File.isTextBundle() || File.isTextPack()) &&
          /(^[\\\/])|(^[a-zA-Z]:)/.exec(mediaUrl) &&
          !assetStorage.shouldManageResource(mediaUrl) &&
          File.isNode
        ) {
          var fileSystemExtra = reqnode('fs-extra');
          if ((await fileSystemExtra.stat(mediaUrl)).size < size)
            return await (async function (sourcePath) {
              var fileSystemExtra = reqnode('fs-extra'),
                destinationPath = assetsDirectory + mediaName;
              try {
                await fileSystemExtra.access(destinationPath, fileSystemExtra.F_OK),
                  (destinationPath = File.editor.imgEdit.uniqueFilePathOnNode(destinationPath));
              } catch (error) {}
              return (
                match || currentMatch
                  ? await fileSystemExtra.copy(sourcePath, destinationPath)
                  : fileSystemExtra.copy(sourcePath, destinationPath),
                destinationPath
              );
            })(mediaUrl);
        }
        return mediaUrl;
      })();
      match
        ? (function (videoUrl) {
            videoUrl = editor.imgEdit.resolveImagePath(videoUrl);
            var videoHtml = '<video src="{url}" controls></video>'.replace('{url}', videoUrl);
            userOperations.pasteHandler(editor, videoHtml, !1);
          })(resolvedMediaPath)
        : currentMatch
          ? (function (audioUrl) {
              audioUrl = editor.imgEdit.resolveImagePath(audioUrl);
              var audioHtml = '<audio src="{url}"></audio>'.replace('{url}', audioUrl);
              userOperations.pasteHandler(editor, audioHtml, !1);
            })(resolvedMediaPath)
          : userOperations.insertFileLink(editor, resolvedMediaPath);
    }
    function w(resourceUrl) {
      resourceUrl &&
        (utilities.IMG_REG.exec(resourceUrl)
          ? File.editor.imgEdit.insertImageFromURL(resourceUrl)
          : b(resourceUrl));
    }
    (moduleExports.getPathForFile = function (fileObject) {
      return fileObject && reqnode ? reqnode('electron').webUtils.getPathForFile(fileObject) : '';
    }),
      (moduleExports.onSaveDiscard = async function () {
        File.bundle.assetsChanges &&
          File.bundle.assetsChanges.add.length + File.bundle.assetsChanges.remove.length > 0 &&
          (await (function (removedAssets) {
            const fileSystemExtra = reqnode('fs-extra'),
              currentFilePath = File.isWin ? '\\' : '/';
            var items = [];
            for (var assetEntry of removedAssets) {
              let [temporaryPath, assetName] = assetEntry,
                restoredPath =
                  File.bundle.filePath + currentFilePath + 'assets' + currentFilePath + assetName;
              items.push(
                fileSystemExtra.move(temporaryPath, restoredPath, { overwrite: !1 }),
                function () {},
              );
            }
            return Promise.all(items);
          })(File.bundle.assetsChanges.remove),
          await recovery.backupAssets(File.bundle.assetsChanges.add, !0));
      }),
      (moduleExports.recordMediaMoves = function (addedPath, removedAsset) {
        let managedAssetName;
        (File.bundle.assetsChanges = File.bundle.assetsChanges || { add: [], remove: [] }),
          (managedAssetName = assetStorage.shouldManageResource(addedPath)) &&
            File.bundle.assetsChanges.add.push(managedAssetName),
          removedAsset &&
            (managedAssetName = assetStorage.shouldManageResource(removedAsset[1])) &&
            File.bundle.assetsChanges.remove.push([removedAsset[0], managedAssetName]);
      }),
      (moduleExports.insertURL = w),
      (moduleExports.insertURLs = function (items) {
        var editor = File.editor;
        items.forEach(function (item, itemIndex) {
          itemIndex > 0 && editor.UserOp.insertParagraph(!1, editor), w(item);
        });
      }),
      (moduleExports.SVG2HtmlImg = function (domNode) {
        if (!domNode) return '';
        var svgDataUrl = d(domNode, !0),
          imgElement = document.createElement('img'),
          bounds = domNode.getBoundingClientRect();
        return (
          domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName
            ? (domNode.setAttribute('height', bounds.height + 8),
              domNode.setAttribute('width', bounds.width + 8),
              (bounds.height += 8),
              (bounds.width += 8))
            : (bounds = domNode.getBoundingClientRect()),
          (imgElement.width = bounds.width),
          (imgElement.height = bounds.height),
          imgElement.setAttribute('src', 'data:image/svg+xml;base64,' + btoa(svgDataUrl)),
          imgElement.outerHTML
        );
      }),
      (moduleExports.processExportedSVG = h),
      (moduleExports.downloadAs = v),
      (moduleExports.copyImage = function (imageElement) {
        return v(imageElement, !0);
      }),
      (moduleExports.saveSVGToTempPath = async function (svgElement, inlineStyles) {
        return File.isMac
          ? await f(svgElement, 'png')
          : await m(
              svgElement,
              inlineStyles,
              'png',
              await (async function () {
                var text = await reqnode('electron').ipcRenderer.invoke('getPath', 'temp');
                temporaryImageSequence++;
                var temporaryPath =
                  text.replace(/[/\\]$/, '') +
                  (File.isWin ? '\\\\' : '/') +
                  Number(new Date()) +
                  temporaryImageSequence +
                  '.png';
                return console.debug('write diagram to ' + temporaryPath), temporaryPath;
              })(),
            );
      });
  },
);
