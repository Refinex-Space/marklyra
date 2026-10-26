// media/actions.
export default function initializeMediaActions(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(cloneSvgForExport, 'name', { value: 'c', configurable: true });
  Object.defineProperty(serializeSvgForExport, 'name', { value: 'd', configurable: true });
  Object.defineProperty(resolveSvgThemeColors, 'name', { value: 'u', configurable: true });
  Object.defineProperty(normalizeSvgNamespaces, 'name', { value: 'h', configurable: true });
  Object.defineProperty(createDiagramHtml, 'name', { value: 'f', configurable: true });
  Object.defineProperty(rasterizeSvg, 'name', { value: 'm', configurable: true });
  Object.defineProperty(copyPngToClipboard, 'name', { value: 'g', configurable: true });
  Object.defineProperty(exportMediaElement, 'name', { value: 'v', configurable: true });
  Object.defineProperty(insertAudioOrVideo, 'name', { value: 'b', configurable: true });
  Object.defineProperty(insertResourceUrl, 'name', { value: 'w', configurable: true });

  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    utilities = (requireModule('model/document-model').Node, requireModule('shared/utilities')),
    assetStorage = requireModule('media/asset-storage'),
    recovery = requireModule('document/recovery'),
    userOperations = requireModule('editing/user-operations'),
    htmlParser = requireModule('model/html-parser');
  requireModule('editing/keyboard-shortcuts').map;
  function cloneSvgForExport(domNode, inlineStyles, opaqueBackground) {
    var background,
      clonedNode = domNode.cloneNode(true),
      computedStyle = window.getComputedStyle(domNode);
    if (
      domNode.querySelector("[*|href='#raphael-marker-block']") &&
      !domNode.querySelector('#raphael-marker-block')
    ) {
      clonedNode
        .querySelector('defs')
        .appendChild(document.querySelector('path#raphael-marker-block').cloneNode());
    }
    if (inlineStyles) {
      Object.defineProperty(
        function copyInlineStyles(sourceElement, destinationElement) {
          Object.defineProperty(copyCollectionToArray, 'name', { value: 'i', configurable: true });

          function copyCollectionToArray(collection) {
            for (
              var items = [], length = collection.length, itemIndex = 0;
              itemIndex < length;
              itemIndex++
            ) {
              items.push(collection[itemIndex]);
            }
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
          var clonedChildren = copyCollectionToArray(destinationElement.children || []);
          if (clonedChildren.length) {
            copyCollectionToArray(sourceElement.children || []).forEach(function (item, itemIndex) {
              copyInlineStyles(item, clonedChildren[itemIndex]);
            });
          }
        },
        'name',
        { value: 'e', configurable: true },
      )(domNode, clonedNode);
    }
    if (domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName) {
      var bounds = domNode.getBoundingClientRect();
      clonedNode.style.textAlign = 'center';
      clonedNode.setAttribute('height', bounds.height + 8);
      clonedNode.setAttribute('width', bounds.width + 8);
    }
    if (!clonedNode.style.color) {
      clonedNode.style.color = computedStyle.color;
    }
    if (computedStyle.getPropertyValue) {
      background = window.getComputedStyle(document.body).backgroundColor;
    }
    if (
      !clonedNode.style.background &&
      ((clonedNode.style.background = computedStyle.backgroundColor),
      'rgba(0, 0, 0, 0)' !== computedStyle.backgroundColor &&
        (background = clonedNode.style.background),
      background)
    ) {
      var match = background.match(/\d+/gi);
      if (match.length) {
        if ((299 * match[0] + 587 * match[1] + 114 * match[2]) / 256e3 < 0.5) {
          clonedNode.style.background = background;
          jquery(clonedNode)
            .find("[fill='var(--bg-color)']")
            .attr('fill', background || 'none');
        } else {
          if (opaqueBackground) {
            clonedNode.style.background = 'white';
            jquery(clonedNode).find("[fill='var(--bg-color)']").attr('fill', 'white');
          } else {
            clonedNode.style.background = '';
            jquery(clonedNode).find("[fill='var(--bg-color)']").attr('fill', 'none');
          }
        }
      }
    }
    return clonedNode;
  }
  function serializeSvgForExport(domNode, inlineStyles, rawMarkup, opaqueBackground) {
    var bounds = domNode.getBoundingClientRect(),
      element = cloneSvgForExport(domNode, inlineStyles, opaqueBackground);
    if (domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName) {
      element.setAttribute('height', 2 * (bounds.height + 8));
      element.setAttribute('width', 2 * (bounds.width + 8));
    } else {
      element.setAttribute('height', bounds.bottom - bounds.top);
    }
    var svgMarkup = normalizeSvgNamespaces(element.outerHTML, false);
    if (!inlineStyles) {
      svgMarkup = resolveSvgThemeColors(svgMarkup);
    }
    if (rawMarkup) {
      return svgMarkup;
    } else {
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
    }
  }
  function resolveSvgThemeColors(svgMarkup) {
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
  function normalizeSvgNamespaces(text, preserveXlink) {
    text = text
      .replace(/xmlns:NS\d+/gi, 'xmlns:xlink')
      .replace(/NS\d+:href/gi, 'xlink:href')
      .replace(/NS\d+:space/gi, 'xml:space')
      .replace(/NS\d+:/gi, '')
      .replace(/<br([^>]*)>/g, '<br/>')
      .replace(
        /<img([^>]*)>/g,
        (unusedParameter1, imageAttributes) => `<img ${imageAttributes} />`,
      );
    if (!preserveXlink) {
      text = text.replace(/xlink:/g, '');
    }
    return text;
  }
  var temporaryImageSequence = 0;
  function createDiagramHtml(element, extension) {
    var html =
        "<html style='margin:0;padding:0;'><head><meta charset='UTF-8'><style>" +
        (function () {
          var diagramCss = '';
          for (var stylesheet of document.styleSheets) {
            try {
              if (
                stylesheet.href &&
                stylesheet.href.indexOf('mermaid.css') > -1 &&
                stylesheet.cssRules
              ) {
                for (var cssRule of stylesheet.cssRules) {
                  diagramCss += cssRule.cssText || '';
                }
              }
              if (
                stylesheet.href &&
                stylesheet.href.indexOf('mermaid-zenuml.css') > -1 &&
                stylesheet.cssRules
              ) {
                for (var cssRule of stylesheet.cssRules) {
                  diagramCss += cssRule.cssText || '';
                }
              }
              if (
                stylesheet.href &&
                stylesheet.href.indexOf('mermaid.dark.css') > -1 &&
                stylesheet.cssRules
              ) {
                for (var cssRule of stylesheet.cssRules) {
                  diagramCss += cssRule.cssText || '';
                }
              }
            } catch (error) {}
          }
          return diagramCss;
        })() +
        "</style></head><body style='margin:0;padding:0;'>$1</body></html>",
      bounds = element.getBoundingClientRect(),
      width = bounds.width;
    if (element.querySelector('[data-v-app]')) {
      width = element.querySelector('[data-v-app]').getBoundingClientRect().width + 32;
    }
    bounds = { x: 0, y: 0, width: width, height: bounds.height };
    html = html.replace('$1', serializeSvgForExport(element, true, true));
    return JSBridge.invoke('controller.screenshotHTML', {
      html: html,
      rect: bounds,
      extension: extension || 'png',
    });
  }
  function rasterizeSvg(svgElement, inlineStyles, imageFormat, destination) {
    return new Promise((resolvePromise) => {
      var src = serializeSvgForExport(svgElement, inlineStyles, false, 'jpeg' == imageFormat),
        imageInstance = new Image();
      imageInstance.onerror = function (unusedParameter1) {
        resolvePromise('');
      };
      imageInstance.onload = function () {
        var canvasElement = document.createElement('canvas'),
          canvasContext = canvasElement.getContext('2d'),
          canvasratio = File.canvasratio,
          width = imageInstance.width,
          height = imageInstance.height;
        canvasElement.width = width;
        canvasElement.height = height;
        if (canvasratio > 1.1) {
          canvasElement.width = width * canvasratio;
          canvasElement.height = height * canvasratio;
          canvasContext.scale(canvasratio, canvasratio);
        }
        canvasElement.style.width = width + 'px';
        canvasElement.style.height = height + 'px';
        canvasContext.drawImage(imageInstance, 0, 0);
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
            if ('clipboard' === destination) {
              copyPngToClipboard(imageBase64);
              return void onSaved();
            }
            if (File.isNode) {
              var imageBytes = imageBase64;
              reqnode('fs').writeFile(destination, imageBytes, 'base64', function (inputError) {
                if (inputError) {
                  onSaved('');
                  console.sendError(inputError);
                } else {
                  onSaved(destination);
                }
              });
            } else {
              if (File.isMac) {
                imageBase64 = `data:image/${imageFormat};base64,` + imageBase64;
                bridge.callHandler('images.savePNG', imageBase64, async function (from) {
                  if (
                    from &&
                    destination &&
                    (await JSBridge.invoke('path.moveFile', { from: from, to: destination }))
                  ) {
                    onSaved(destination);
                  } else {
                    onSaved('');
                  }
                });
              }
            }
          })(imageBase64, imageFormat, destination, resolvePromise);
        }, 100);
      };
      imageInstance.src = src;
    });
  }
  function copyPngToClipboard(path) {
    path = 'data:image/png;base64,' + path;
    if (File.isNode) {
      const nativeImage = reqnode('electron').nativeImage.createFromDataURL(path);
      reqnode('electron').clipboard.writeImage(nativeImage);
    } else {
      bridge.callHandler('clipboard.writeImage', { path: path }, function () {
        callback();
      });
    }
  }
  async function exportMediaElement(domNode, copyToClipboard) {
    if (domNode) {
      if ('svg' == domNode.tagName) {
        return await (async function (inputElement) {
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
            if (copyToClipboard) {
              path = 'clipboard';
            }
            var element = inputElement.closest("[lang='mermaid']"),
              currentElement = inputElement.closest('mjx-container');
            if (/\.svg$/.exec(path)) {
              var content = resolveSvgThemeColors(
                normalizeSvgNamespaces(
                  (inputElement = cloneSvgForExport(inputElement, element, false)).outerHTML,
                  false,
                ),
              );
              if (File.isNode) {
                return new Promise((resolvePromise) => {
                  reqnode('fs').writeFile(path, content, 'utf8', resolvePromise);
                });
              }
              if (File.isMac) {
                return JSBridge.invoke('image.saveSVG', { path: path, content: content });
              }
            }
            var imageFormat = copyToClipboard || /\.png$/.exec(path) ? 'png' : 'jpeg';
            if (File.isNode || currentElement) {
              return await rasterizeSvg(inputElement, element, imageFormat, path);
            }
            if (File.isMac) {
              var currentPath = await createDiagramHtml(inputElement, imageFormat);
              if (copyToClipboard) {
                await JSBridge.invoke('clipboard.writeImage', { path: currentPath });
                return '';
              } else {
                if (await JSBridge.invoke('path.moveFile', { from: currentPath, to: path })) {
                  return path;
                } else {
                  return '';
                }
              }
            }
          }
        })(domNode);
      } else {
        return await (async function (imageElement) {
          if (imageElement.src) {
            if (File.isMac && /^(wk)?file:/.exec(imageElement.src)) {
              var imagePath = utilities.absolutePathFrom(imageElement.src);
              JSBridge.invoke('shell.showSaveImage', imagePath);
            } else {
              JSBridge.invoke('shell.showDownload', imageElement.src);
            }
          }
        })(domNode);
      }
    }
  }
  moduleExports.copyAsHtml = function (inputElement) {
    var element = inputElement.closest("[lang='mermaid']"),
      currentElement = inputElement.closest('[cid]'),
      svgMarkup = resolveSvgThemeColors(
        normalizeSvgNamespaces(
          (inputElement = cloneSvgForExport(inputElement, element, false)).outerHTML,
          false,
        ),
      ),
      markdownHtml = htmlParser
        .getMarkElemFromCurrentHtml(currentElement.outerHTML, File.editor)
        .html();
    userOperations.setClipboard(null, markdownHtml, svgMarkup);
  };
  const size = 31457280;
  async function insertAudioOrVideo(mediaUrl) {
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
        if ((await fileSystemExtra.stat(mediaUrl)).size < size) {
          return await (async function (sourcePath) {
            var fileSystemExtra = reqnode('fs-extra'),
              destinationPath = assetsDirectory + mediaName;
            try {
              await fileSystemExtra.access(destinationPath, fileSystemExtra.F_OK);
              destinationPath = File.editor.imgEdit.uniqueFilePathOnNode(destinationPath);
            } catch (error) {}
            if (match || currentMatch) {
              await fileSystemExtra.copy(sourcePath, destinationPath);
            } else {
              fileSystemExtra.copy(sourcePath, destinationPath);
            }
            return destinationPath;
          })(mediaUrl);
        }
      }
      return mediaUrl;
    })();
    if (match) {
      (function (videoUrl) {
        videoUrl = editor.imgEdit.resolveImagePath(videoUrl);
        var videoHtml = '<video src="{url}" controls></video>'.replace('{url}', videoUrl);
        userOperations.pasteHandler(editor, videoHtml, false);
      })(resolvedMediaPath);
    } else {
      if (currentMatch) {
        (function (audioUrl) {
          audioUrl = editor.imgEdit.resolveImagePath(audioUrl);
          var audioHtml = '<audio src="{url}"></audio>'.replace('{url}', audioUrl);
          userOperations.pasteHandler(editor, audioHtml, false);
        })(resolvedMediaPath);
      } else {
        userOperations.insertFileLink(editor, resolvedMediaPath);
      }
    }
  }
  function insertResourceUrl(resourceUrl) {
    if (resourceUrl) {
      if (utilities.IMG_REG.exec(resourceUrl)) {
        File.editor.imgEdit.insertImageFromURL(resourceUrl);
      } else {
        insertAudioOrVideo(resourceUrl);
      }
    }
  }
  moduleExports.getPathForFile = function (fileObject) {
    if (fileObject && reqnode) {
      return reqnode('electron').webUtils.getPathForFile(fileObject);
    } else {
      return '';
    }
  };
  moduleExports.onSaveDiscard = async function () {
    if (
      File.bundle.assetsChanges &&
      File.bundle.assetsChanges.add.length + File.bundle.assetsChanges.remove.length > 0
    ) {
      await (function (removedAssets) {
        const fileSystemExtra = reqnode('fs-extra'),
          currentFilePath = File.isWin ? '\\' : '/';
        var items = [];
        for (var assetEntry of removedAssets) {
          let [temporaryPath, assetName] = assetEntry,
            restoredPath =
              File.bundle.filePath + currentFilePath + 'assets' + currentFilePath + assetName;
          items.push(
            fileSystemExtra.move(temporaryPath, restoredPath, { overwrite: false }),
            function () {},
          );
        }
        return Promise.all(items);
      })(File.bundle.assetsChanges.remove);
      await recovery.backupAssets(File.bundle.assetsChanges.add, true);
    }
  };
  moduleExports.recordMediaMoves = function (addedPath, removedAsset) {
    let managedAssetName;
    File.bundle.assetsChanges = File.bundle.assetsChanges || { add: [], remove: [] };
    if ((managedAssetName = assetStorage.shouldManageResource(addedPath))) {
      File.bundle.assetsChanges.add.push(managedAssetName);
    }
    if (removedAsset && (managedAssetName = assetStorage.shouldManageResource(removedAsset[1]))) {
      File.bundle.assetsChanges.remove.push([removedAsset[0], managedAssetName]);
    }
  };
  moduleExports.insertURL = insertResourceUrl;
  moduleExports.insertURLs = function (items) {
    var editor = File.editor;
    items.forEach(function (item, itemIndex) {
      if (itemIndex > 0) {
        editor.UserOp.insertParagraph(false, editor);
      }
      insertResourceUrl(item);
    });
  };
  moduleExports.SVG2HtmlImg = function (domNode) {
    if (!domNode) {
      return '';
    }
    var svgDataUrl = serializeSvgForExport(domNode, true),
      imgElement = document.createElement('img'),
      bounds = domNode.getBoundingClientRect();
    if (domNode.parentElement && 'MJX-CONTAINER' == domNode.parentElement.tagName) {
      domNode.setAttribute('height', bounds.height + 8);
      domNode.setAttribute('width', bounds.width + 8);
      bounds.height += 8;
      bounds.width += 8;
    } else {
      bounds = domNode.getBoundingClientRect();
    }
    imgElement.width = bounds.width;
    imgElement.height = bounds.height;
    imgElement.setAttribute('src', 'data:image/svg+xml;base64,' + btoa(svgDataUrl));
    return imgElement.outerHTML;
  };
  moduleExports.processExportedSVG = normalizeSvgNamespaces;
  moduleExports.downloadAs = exportMediaElement;
  moduleExports.copyImage = function (imageElement) {
    return exportMediaElement(imageElement, true);
  };
  moduleExports.saveSVGToTempPath = async function (svgElement, inlineStyles) {
    if (File.isMac) {
      return await createDiagramHtml(svgElement, 'png');
    } else {
      return await rasterizeSvg(
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
          console.debug('write diagram to ' + temporaryPath);
          return temporaryPath;
        })(),
      );
    }
  };
}
