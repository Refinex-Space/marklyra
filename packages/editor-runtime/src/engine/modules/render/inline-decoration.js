// render/inline-decoration.
export default function initializeRenderInlineDecoration(
  requireModule,
  moduleExports,
  moduleRecord,
) {
  'use strict';

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    dialogs = requireModule('ui/dialogs'),
    fileIntegration = requireModule('host/file-integration'),
    assetStorage = requireModule('media/asset-storage'),
    domPurifyExport = requireModule('libraries/dom-purify-export'),
    htmlBlocks = requireModule('render/html-blocks'),
    mediaActions = requireModule('media/actions'),
    NodeType = (documentModel.Node, documentModel.TYPE);
  window.failImgCache = [];
  window.loadedImgCache = [];
  var mathSequence = 0;
  window.removeLastModifyQuery = function (imageUrl) {
    return (imageUrl || '').replace(/\?lastModify=(.+)$/, '');
  };
  var escapeAttributeText = function (attributeText) {
      return utilities.escapeForPreWrap(attributeText);
    },
    encodeLinkUrl = function (trimmedText, preserveUrlSuffix) {
      if (/%[0-9a-f]{2}/i.exec(trimmedText)) {
        return trimmedText.replace(/'/g, '%27').replace(/"/g, '%22');
      }
      var text = (trimmedText = (trimmedText || '').trim());
      try {
        text = decodeURI(trimmedText);
      } catch (error) {
        text = trimmedText;
      }
      try {
        if (/^file:/.exec(text)) {
          text = text.replace(/\\/g, '/');
        }
        text = encodeURI(text).replace(/'/g, '%27').replace(/"/g, '%22');
      } catch (currentError) {
        console.sendError('unable to process escapeURL ' + trimmedText, 'warning');
        text = (text || '').replace(/\\/g, '/').replace(/'/g, '%27').replace(/"/g, '%22');
      }
      if (preserveUrlSuffix) {
        var urlSuffix = (/[#?][^\/\\\.]*$/.exec(text) || [''])[0];
        return text.substr(0, text.length - urlSuffix.length).replace(/#/g, '%23') + urlSuffix;
      }
      return text;
    };
  function renderAlertIcon(alertKind) {
    switch (alertKind) {
      case 'important':
        return '<svg viewBox="0 0 16 16" version="1.1" width="1em" height="1em" aria-hidden="true"><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';
      case 'warning':
        return '<svg viewBox="0 0 16 16" version="1.1" width="1em" height="1em" aria-hidden="true"><path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path></svg>';
      case 'tip':
        return '<svg viewBox="0 0 16 16" version="1.1" width="1em" height="1em" aria-hidden="true"><path d="M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z"></path></svg>';
      case 'caution':
        return '<svg viewBox="0 0 16 16" version="1.1" width="1em" height="1em" aria-hidden="true"><path d="M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
      case 'note':
      default:
        return '<svg viewBox="0 0 16 16" version="1.1" width="1em" height="1em" aria-hidden="true"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path></svg>';
    }
  }
  window.onImageLoadedFunc = function (loadEvent) {
    console.debug('onImageLoadedFunc');
    var target = loadEvent.target;
    if (document.body.contains(target) && !target.dataset.realSrc) {
      var searchValue = window.removeLastModifyQuery(target.getAttribute('src')) || '';
      if (searchValue.trim()) {
        searchValue = searchValue.replace(/^wkfile:/i, 'file:');
        if (-1 == loadedImgCache.indexOf(searchValue) && searchValue.trim().length) {
          loadedImgCache.push(searchValue);
        }
        setTimeout(function () {
          target.setAttribute('onload', 'onLoadedFuncForQuickAction(event)');
        }, 10);
        $(target).closest('.md-image').addClass('md-img-loaded').removeClass('md-img-error');
        if (!target.dataset.localRefresh) {
          if (target.getAttribute('aftermove')) {
            target.style.background = '';
            target.style.width = '';
            target.style.height = '';
            target.removeAttribute('aftermove');
          }
          if (imagePreLoadAfterMove[searchValue]) {
            setTimeout(function () {
              delete imagePreLoadAfterMove[searchValue];
            }, 200);
          } else {
            File.editor.imgEdit.afterUserInsertImage(target);
          }
          File.editor.imgEdit.tryAddImageToBusyLoader(target);
          File.editor.tryEnterBusyModeWithDelay();
        }
      }
    }
  };
  window.onImageErrorFunc = function (errorEvent) {
    var target = errorEvent.target;
    if (document.body.contains(target)) {
      var searchValue = window.removeLastModifyQuery(target.getAttribute('src')) || '';
      if (searchValue.trim()) {
        searchValue = searchValue.replace(/^wkfile:/i, 'file:');
        if (failImgCache.length > 5e3) {
          failImgCache = [];
        }
        if (-1 == failImgCache.indexOf(searchValue) && searchValue.trim().length) {
          failImgCache.push(searchValue);
        }
        loadedImgCache.remove(searchValue);
        $(target).closest('.md-image').addClass('md-img-error').removeClass('md-img-loaded');
        File.editor.imgEdit.removeUploadingStyle($(target));
        window.uploadImageQueue.delete(searchValue);
        window.moveImageQueue.delete(searchValue);
        target.setAttribute('onerror', null);
      }
    }
  };
  window.onLoadedFuncForQuickAction = function (loadEvent) {
    var target = loadEvent.target;
    if (document.body.contains(target) && !target.dataset.realSrc) {
      var imageUrl = window.removeLastModifyQuery(target.getAttribute('src'));
      if (imagePreLoadAfterMove[imageUrl]) {
        setTimeout(function () {
          delete imagePreLoadAfterMove[imageUrl];
        }, 200);
      }
      $(target).closest('.md-image').addClass('md-img-loaded');
      File.editor.imgEdit.afterUserInsertImage(target);
      File.editor.imgEdit.tryAddImageToBusyLoader(target);
    }
  };
  function appendLocalImageVersion(imageUrl) {
    if (/^file:/.exec(imageUrl) && !/\?.+/.exec(imageUrl)) {
      imageUrl = imageUrl + '?lastModify=' + window._lastFocusTimeMark;
    }
    return imageUrl;
  }
  function decorateInlineToken(token, sourceText, sourceOrReference, sourceMatch) {
    var trimmedText,
      referenceId,
      outerHTML,
      imageWrapper,
      sourceMarkup,
      emptySource,
      type = token.type,
      editor = File.editor,
      referenceAttribute = '',
      multilineClass = sourceText.indexOf('\n') > -1 ? ' md-image-multi-line ' : '',
      truncateSource = false;
    function truncateSourcePreview(text) {
      if (!truncateSource || text.length < 100) {
        return text;
      } else {
        return (
          text.substr(0, 20) +
          "<span class='marklyra-text-ellipsis' data-hidden-text='" +
          text.substr(20, text.length - 80) +
          "' ></span>" +
          text.substr(text.length - 80)
        );
      }
    }
    sourceMarkup = (
      sourceMatch
        ? ((emptySource = 0 == sourceMatch[1].trim().length),
          "<span class='md-image-before-src marklyra-focusable'>" +
            utilities.escape(sourceMatch[0]) +
            "</span><span class='md-image-src-span marklyra-focusable'>" +
            (emptySource
              ? "<span class='md-image-btn marklyra-focusable-btn md-image-input-src-btn' content='" +
                $.localize.getString('input image URL', 'Front') +
                "'></span><span class='md-image-btn marklyra-focusable-btn md-image-pick-file-btn' marklyra-hint='" +
                $.localize.getString('Select image from local file', 'Front') +
                "'></span>"
              : truncateSourcePreview(utilities.escape(sourceMatch[1]))) +
            "</span><span class='md-image-after-src'>" +
            utilities.escape(sourceMatch[2]) +
            '</span>')
        : truncateSourcePreview(utilities.escape(sourceText))
    ).replace(/\u00a0/g, ' ');
    if (type == NodeType.refimg) {
      referenceId = sourceOrReference;
      trimmedText = editor.nodeMap.link_list.getHrefByRef(referenceId) || '';
      referenceAttribute = " data-ref='" + escapeAttributeText(referenceId) + "' ";
      if (!trimmedText) {
        return (
          "<span md-inline='refimg' class='md-image md-no-ref" +
          multilineClass +
          "' " +
          referenceAttribute +
          "><span class='md-meta md-before md-content' contenteditable='true' data-hint='" +
          $.localize
            .getString('Please define image reference by \n[{0}]: http://example.png')
            .format(escapeAttributeText(referenceId)) +
          "' >" +
          sourceMarkup +
          '</span></span>'
        );
      }
    } else {
      trimmedText = sourceOrReference;
    }
    var element = null;
    if (type == NodeType.imgtag) {
      if (
        'BODY' ==
        (element = domPurifyExport.sanitize(
          sourceText,
          htmlBlocks.getDomPurifyConfig(htmlBlocks.INLINE_CONFIG),
        )).tagName
      ) {
        element = element.children[0] || document.createElement('img');
      }
    } else {
      element = document.createElement('img');
    }
    element.setAttribute('referrerPolicy', 'no-referrer');
    trimmedText = (trimmedText || '').trim();
    var sourceAttribute = " data-src='" + utilities.escapeForPreWrap(trimmedText) + "' ",
      currentAttributeValue = editor.imgEdit.getRealSrc(trimmedText, void 0, true, true),
      absoluteImagePath = utilities.absolutePathFrom(currentAttributeValue),
      match = /^data:/.exec(currentAttributeValue),
      currentMatch = /^file:\/\//i.exec(currentAttributeValue || ''),
      attributeValue = currentAttributeValue,
      preloadedImage = imagePreLoadAfterMove[currentAttributeValue.replace(/\\/g, '/')];
    if (token.title) {
      element.setAttribute('title', token.title);
    }
    if (token.alt) {
      element.setAttribute('alt', token.alt);
    }
    if (match) {
      sourceAttribute = " data-is-data-src='true' ";
    } else {
      if (currentMatch) {
        attributeValue = attributeValue.replace(/\\/g, '/');
      }
    }
    currentAttributeValue = encodeLinkUrl(attributeValue, true);
    if (currentMatch) {
      currentAttributeValue += '?lastModify=' + imgLastModified;
    }
    if (!match && /\.svg([#?][^\/\\]*)*$/i.exec(trimmedText)) {
      element.classList.add('md-svg-img');
    }
    if (utilities.fromExternalPath(currentAttributeValue)) {
      currentAttributeValue = 'wk' + currentAttributeValue;
    }
    if (
      match ||
      loadedImgCache.indexOf(attributeValue) > -1 ||
      loadedImgCache.indexOf(encodeLinkUrl(attributeValue, true)) > -1
    ) {
      element.setAttribute('src', currentAttributeValue);
      element.setAttribute('onerror', 'onImageErrorFunc(event)');
      element.setAttribute('onload', 'onLoadedFuncForQuickAction(event)');
      outerHTML =
        "<span md-inline='" +
        type +
        "'" +
        sourceAttribute +
        " contenteditable='false' class='md-image md-img-loaded" +
        multilineClass +
        "' " +
        referenceAttribute +
        "><span class='md-meta md-before md-content' contenteditable='true'>" +
        sourceMarkup +
        '</span>' +
        element.outerHTML +
        '</span>';
    } else {
      if (failImgCache.indexOf(attributeValue) > -1) {
        element.setAttribute('src', '');
        outerHTML =
          "<span md-inline='" +
          type +
          "'" +
          sourceAttribute +
          " contenteditable='false' class='md-image md-img-error" +
          multilineClass +
          "' " +
          referenceAttribute +
          "><span class='md-meta md-content md-before' contenteditable='true'>" +
          sourceMarkup +
          '</span>' +
          element.outerHTML +
          '</span>';
      } else {
        var loadingClass = '';
        if (!(element.getAttribute('style') || '').trim().length && preloadedImage) {
          console.debug(preloadedImage);
          element.setAttribute(
            'style',
            element.getAttribute('style') +
              ';' +
              preloadedImage.size +
              ";background-image:url('" +
              encodeLinkUrl(preloadedImage.src, true) +
              "');",
          );
          element.setAttribute('aftermove', 'true');
          loadingClass = ' md-img-loaded';
        }
        loadingClass += multilineClass;
        element.setAttribute('src', currentAttributeValue);
        element.setAttribute('onerror', 'onImageErrorFunc(event)');
        element.setAttribute('onload', 'onImageLoadedFunc(event)');
        outerHTML =
          "<span md-inline='" +
          type +
          "'" +
          sourceAttribute +
          " contenteditable='false' class='md-image" +
          loadingClass +
          "' data-src='" +
          currentAttributeValue +
          "' " +
          referenceAttribute +
          "><span class='md-meta md-before md-content' contenteditable='true'>" +
          sourceMarkup +
          '</span>' +
          element.outerHTML +
          '</span>';
      }
    }
    if (
      type == NodeType.image &&
      -1 == failImgCache.indexOf(utilities.wkfile2file(currentAttributeValue))
    ) {
      if (window.uploadImageQueue.has(absoluteImagePath)) {
        showImageTransferIndicator((imageWrapper = $(outerHTML)), absoluteImagePath, false);
        outerHTML = imageWrapper[0].outerHTML;
      } else {
        if (window.moveImageQueue.has(absoluteImagePath)) {
          showImageTransferIndicator((imageWrapper = $(outerHTML)), absoluteImagePath, true);
          outerHTML = imageWrapper[0].outerHTML;
        }
      }
    }
    return outerHTML;
  }
  function showImageTransferIndicator(element, imagePath, moving, deferIndicator) {
    function appendTransferIndicator() {
      var statusClass = moving ? 'md-img-loaded md-on-moving' : 'md-img-loaded md-on-uploading';
      element.addClass(statusClass);
      element.append(
        $('#marklyra-uploading-image-templ')
          .html()
          .replace(/\s*\n\s*/g, ''),
      );
    }
    if (deferIndicator) {
      setTimeout(function () {
        if (
          (moving ? moveImageQueue : uploadImageQueue).has(imagePath) &&
          document.body.contains(element[0])
        ) {
          appendTransferIndicator();
        }
      }, 1e3);
    } else {
      appendTransferIndicator();
    }
    element.attr('data-origin-path', imagePath);
  }
  window.addDateQuery = appendLocalImageVersion;
  moduleExports.applyUploadingStyle = showImageTransferIndicator;
  moduleExports.decorateAsExport = function (token, exportOptions, ownerNode) {
    var outerHTML, searchValue, documentNode, imageTitle, footnoteNode;
    function resolveExportUrl(trimmedText, preferWebUrl) {
      trimmedText = (trimmedText || '').trim();
      if (preferWebUrl && !utilities.isFullUrl(trimmedText)) {
        return 'http://' + trimmedText;
      }
      if (exportOptions.forPrint) {
        if (trimmedText.match(/^#/)) {
          var currentElement = dialogs.findAnchorElem(trimmedText, true);
          if ((currentElement || []).length) {
            return (File.isMac ? 'at://' : '#header-') + currentElement.attr('cid');
          } else {
            return trimmedText;
          }
        }
        if (
          !utilities.isFullUrl(trimmedText) &&
          ((trimmedText = trimmedText.trim().replace(/([#?][^.]+)$/, '')), File.isNode)
        ) {
          var fileSystemPlus = reqnode('fs-plus'),
            absolutePath = reqnode('path').resolve(
              fileIntegration.getCurrentFileFolderPath() + '/',
              trimmedText,
            );
          if (assetStorage.isFileSync(absolutePath)) {
            return 'file://' + absolutePath;
          } else {
            if (fileSystemPlus.isFileSync(absolutePath + '.md')) {
              return 'file://' + absolutePath + '.md';
            } else {
              if (fileSystemPlus.isFileSync(absolutePath + '.markdown')) {
                return 'file://' + absolutePath + '.markdown';
              } else {
                if (fileSystemPlus.isFileSync(absolutePath + '.pdf')) {
                  return 'file://' + absolutePath + '.pdf';
                } else {
                  return 'http://' + trimmedText;
                }
              }
            }
          }
        }
      } else {
        if (trimmedText.match(/^#/)) {
          return dialogs.normalizeAnchor(
            trimmedText,
            exportOptions.anchorList,
            !exportOptions.noStyle,
          );
        }
      }
      return trimmedText;
    }
    switch (token.type) {
      case NodeType.strong:
        return '<strong>' + token.inner + '</strong>';
      case NodeType.em:
        return '<em>' + token.inner + '</em>';
      case NodeType.plain:
        if (exportOptions.noStyle) {
          return utilities.escape(token.text);
        } else {
          return '<span>' + utilities.escape(token.text) + '</span>';
        }
      case NodeType.softbreak:
        return '\n';
      case NodeType.code:
        if (exportOptions.forPrint && File.isNode) {
          if (!exportOptions.defaultFont) {
            exportOptions.defaultFont =
              window.getComputedStyle(File.editor.writingArea).fontFamily || 'initial';
          }
          outerHTML =
            '<code>' +
            token.text
              .trim()
              .split(/([\-;]+)/)
              .map(function (item) {
                if (item) {
                  return utilities.escape(item, false, true);
                } else {
                  return '';
                }
              })
              .join('') +
            '</code>';
        } else {
          outerHTML = '<code>' + utilities.escape(token.text.trim(), false, true) + '</code>';
        }
        return outerHTML;
      case NodeType.del:
        return '<del>' + token.inner + '</del>';
      case NodeType.autolink:
      case NodeType.url:
        return (
          "<a href='" +
          escapeAttributeText(resolveExportUrl(token.href, true)) +
          "' target='_blank' class='url'>" +
          token.text +
          '</a>'
        );
      case NodeType.tag:
        if (/^<img/.test(token.text) && exportOptions.forPrint) {
          if ((searchValue = (/src\s*=\s*(['"])((.|\n)*?)\1/.exec(token.text) || [])[2])) {
            searchValue = File.editor.imgEdit
              .getRealSrc(searchValue, void 0, true, true)
              .replace(/^file:\/\/\/?/i, 'file:///')
              .replace(/\\/g, '/');
            return token.text.replace(
              /(\ssrc\s*=\s*)(['"])([^"']*)(\2)/,
              '$1$2' + searchValue + '$4',
            );
          }
          if ((searchValue = (/src\s*=\s*([^\s'"]+)(\s|$)/.exec(token.text) || [])[1])) {
            searchValue = File.editor.imgEdit
              .getRealSrc(searchValue, void 0, true, true)
              .replace(/^file:\/\/\/?/i, 'file:///')
              .replace(/\\/g, '/');
            return token.text.replace(/src\s*=\s*([^\s'"]+)(\s|$)/, "src='" + searchValue + "' ");
          }
        }
        return token.text;
      case NodeType.br:
      case NodeType.imgtag:
      case NodeType.ruby:
        return htmlBlocks.buildHTMLForExport(token.text, File.editor, exportOptions.forPrint);
      case NodeType.html_inline:
        return htmlBlocks.buildHTMLForExport(
          token.before + token.after,
          File.editor,
          exportOptions.forPrint,
        );
      case NodeType.link:
        return (
          "<a href='" +
          escapeAttributeText(resolveExportUrl(token.href)) +
          "'" +
          (token.title ? " title='" + escapeAttributeText(token.title) + "'" : '') +
          '>' +
          token.inner +
          '</a>'
        );
      case NodeType.image:
        searchValue = exportOptions.forPrint
          ? File.editor.imgEdit.getRealSrc(token.href)
          : token.href;
        if (exportOptions.forPrint && failImgCache.indexOf(searchValue) > -1) {
          outerHTML = '';
        } else {
          searchValue = exportOptions.forPrint
            ? appendLocalImageVersion(encodeLinkUrl(searchValue, true))
            : escapeAttributeText(searchValue);
          var element = $(
            "<img src='" +
              searchValue +
              "'" +
              (exportOptions.forPrint ? " referrerPolicy='no-referrer'" : '') +
              '/>',
          )[0];
          if (token.alt) {
            element.setAttribute('alt', token.alt);
          }
          if (token.title) {
            element.setAttribute('title', token.title);
          }
          outerHTML = element.outerHTML;
        }
        if (!exportOptions.noStyle && token.onlyChild) {
          outerHTML = "<span class='md-image'>" + outerHTML + '</span>';
        }
        return outerHTML;
      case NodeType.footnote:
        if ((footnoteNode = exportOptions.nodeMap.foot_list.getNodeByRef(token.text))) {
          var footnoteId,
            footnoteNumber = exportOptions.footnoteList.indexOf(token.text) + 1;
          if (0 == footnoteNumber) {
            exportOptions.footnoteList.push(token.text);
            footnoteNumber = exportOptions.footnoteList.length;
          }
          return (outerHTML =
            "<sup class='md-footnote'><a href='#dfref-footnote-" +
            (footnoteId = exportOptions.appendFootnote(footnoteNode, footnoteNumber)) +
            "' name='ref-footnote-" +
            footnoteId +
            "'>" +
            footnoteNumber +
            '</a></sup>');
        }
        if (exportOptions.noStyle) {
          return utilities.escape(token.text);
        } else {
          return '<span>[^' + utilities.escape(token.text) + ']</span>';
        }
      case NodeType.escape:
        if (exportOptions.noStyle) {
          return utilities.escape(token.text);
        } else {
          return '<span>' + utilities.escape(token.text) + '</span>';
        }
      case NodeType.refimg:
        imageTitle = (documentNode = exportOptions.nodeMap.link_list.getNodeByRef(
          token.ref || token.text,
        ))
          ? escapeAttributeText(documentNode.get('title'))
          : void 0;
        if (void 0 !== (searchValue = documentNode ? documentNode.get('href') : void 0)) {
          searchValue = exportOptions.forPrint
            ? appendLocalImageVersion(
                encodeLinkUrl(File.editor.imgEdit.getRealSrc(searchValue), true),
              )
            : escapeAttributeText(searchValue);
          outerHTML =
            "<img alt='" +
            token.text +
            "' src='" +
            searchValue +
            "'" +
            (imageTitle ? " title='" + imageTitle + "'" : '') +
            (exportOptions.forPrint ? " referrerPolicy='no-referrer'" : '') +
            "'></img>";
          if (!exportOptions.noStyle) {
            outerHTML = "<span class='md-image'>" + outerHTML + '</span>';
          }
          if (exportOptions.forPrint && failImgCache.indexOf(searchValue) > -1) {
            outerHTML = '';
          }
          return outerHTML;
        } else {
          return '![' + token.inner + '][' + utilities.escape(token.ref) + ']';
        }
      case NodeType.reflink:
        searchValue = (documentNode = exportOptions.nodeMap.link_list.getNodeByRef(
          token.ref || token.text,
        ))
          ? escapeAttributeText(resolveExportUrl(documentNode.get('href')))
          : void 0;
        imageTitle = documentNode ? escapeAttributeText(documentNode.get('title')) : void 0;
        if (void 0 !== searchValue) {
          return (
            "<a href='" +
            searchValue +
            "' target='_blank'" +
            (imageTitle ? " title='" + imageTitle + "'" : '') +
            '>' +
            token.inner +
            '</a>'
          );
        } else {
          return '[' + token.inner + '][' + utilities.escape(token.ref) + ']';
        }
      case NodeType.attr:
        return '';
      case NodeType.emoji:
        if (File.option.monocolorEmoji) {
          return "<span class='md-emoji'>" + token.inner + '</span>';
        } else {
          return token.inner;
        }
      case NodeType.inline_math:
        if (exportOptions.noStyle && 'latex' == File.option.mathFormatOnCopy) {
          return (token.pattern || '$') + token.text + (token.pattern || '$');
        } else {
          return (function (inputTrimmedText, ownerNode, includeMathMl) {
            inputTrimmedText = inputTrimmedText.replace(/\u200B/g, '').trim();
            var mathHtml = svgCache[inputTrimmedText];
            if (mathHtml) {
              if (!includeMathMl) {
                mathHtml = $('<span>' + mathHtml + '</span>')
                  .find('mjx-assistive-mml')
                  .remove()
                  .end()
                  .html();
              }
            } else {
              if (ownerNode && ownerNode.cid) {
                var elements = document.querySelectorAll(
                  "[cid='" + ownerNode.cid + "'] .md-inline-math.math-jax-postprocess",
                );
                elements.forEach(function (inputElement) {
                  if (!mathHtml) {
                    var trimmedText = ((inputElement.querySelector('script') || {}).innerText || '')
                      .replace(/\u200B/g, '')
                      .trim();
                    if (trimmedText == inputTrimmedText) {
                      var clonedNode = inputElement
                          .querySelector('.md-inline-math-container')
                          .cloneNode(true),
                        currentElement = clonedNode.querySelector('mjx-assistive-mml');
                      if (!includeMathMl && currentElement) {
                        currentElement.remove();
                      }
                      svgCache[inputTrimmedText] = mediaActions.processExportedSVG(
                        clonedNode.innerHTML,
                        true,
                      );
                      mathHtml = svgCache[inputTrimmedText];
                    }
                  }
                });
              }
            }
            return (
              mathHtml ||
              "<span class='math-in-toc'>$" +
                utilities.escapeForPreWrap(inputTrimmedText) +
                '$</span>'
            );
          })(
            token.text,
            ownerNode,
            !exportOptions.noStyle && !exportOptions.forPrint && !exportOptions.forImage,
          );
        }
      case NodeType.subscript:
        return '<sub>' + token.inner + '</sub>';
      case NodeType.superscript:
        return '<sup>' + token.inner + '</sup>';
      case NodeType.underline:
        return '<u>' + token.inner + '</u>';
      case NodeType.alert_text:
        var alertLabel = utilities.capitalize(token.inner);
        try {
          alertLabel = utilities.capitalize(
            JSON.parse(
              window.getComputedStyle(
                document.querySelector(`.md-alert-text-container[data-text='${token.inner}']`),
                ':after',
              ).content,
            ),
          );
        } catch (error) {}
        if (exportOptions.noStyle) {
          return `<strong class='md-alert-text md-alert-text-${token.inner}'>${alertLabel}</strong><br>`;
        } else {
          return `<span class='md-alert-text md-alert-text-${token.inner}'>${renderAlertIcon(token.inner)}${alertLabel}</span><br>`;
        }
      case NodeType.tab:
        if (exportOptions.noStyle) {
          return token.inner;
        } else {
          return '<span>' + token.inner + '</span>';
        }
      case NodeType.linebreak:
        return '<br/>';
      case NodeType.highlight:
        return '<mark>' + token.inner + '</mark>';
      default:
        return token.inner || token.text || '';
    }
  };
  moduleExports.decorate = function (token, unusedParameter2) {
    switch (token.type) {
      case 'block':
        return "<span class='md-block-like'>" + token.inner + '</span>';
      case NodeType.heading:
        return (
          "<span class='md-block-like'><span class='md-blockmeta'>" +
          token.meta_before +
          "</span><span class='md-header-span'>" +
          token.inner +
          '</span>' +
          (token.meta_after ? "<span class='md-blockmeta'>" + token.meta_after + '</span>' : '') +
          '</span>'
        );
      case NodeType.paragraph:
        return token.inner;
      case NodeType.blockquote:
        return (
          "<span class='md-block-like'><span class='md-blockmeta'>" +
          token.pattern +
          '</span>' +
          token.inner +
          '</span>'
        );
      case NodeType.fences:
        return (
          "<span class='md-block-like' mdlike='" +
          token.type +
          "'><span class='md-blockmeta'>" +
          token.pattern +
          "</span><span class='md-lang'>" +
          utilities.escape(token.lang) +
          '</span></span>'
        );
      case NodeType.def_footnote:
        return (
          "<span class='md-block-like' mdlike='" +
          token.type +
          "'><span class='md-blockmeta'>[^</span>" +
          token.ref +
          "<span class='md-blockmeta'>]:" +
          token.pattern +
          "</span><span class='md-def-content'>" +
          token.inner +
          '</span></span>'
        );
      case NodeType.def_link:
        return (
          "<span class='md-block-like' mdlike='" +
          token.type +
          "'><span class='md-blockmeta'>[</span>" +
          token.ref +
          "<span class='md-blockmeta'>]:" +
          token.pattern +
          "</span><span class='md-def-content'>" +
          token.inner +
          '</span></span>'
        );
      case NodeType.strong:
        return (
          "<span md-inline='strong' class='md-pair-s " +
          (token.inner ? '' : 'md-empty') +
          "'><span class='md-meta md-before'>" +
          token.pattern +
          '</span><strong>' +
          token.inner +
          "</strong><span class='md-meta md-after'>" +
          token.pattern +
          '</span></span>'
        );
      case NodeType.em:
        return (
          "<span md-inline='em' class='md-pair-s " +
          (token.inner ? '' : 'md-empty') +
          "'><span class='md-meta md-before'>" +
          token.pattern +
          '</span><em>' +
          token.inner +
          "</em><span class='md-meta md-after'>" +
          token.pattern +
          '</span></span>'
        );
      case NodeType.highlight:
        return (
          "<span md-inline='highlight' class='md-pair-s'><span class='md-meta md-before'>==</span><mark>" +
          token.inner +
          "</mark><span class='md-meta md-after'>==</span></span>"
        );
      case NodeType.plain:
        return (
          "<span md-inline='plain' class='md-plain'>" + utilities.escape(token.text) + '</span>'
        );
      case NodeType.code:
        var leadingSpace = (token.text.match(/^\s/) || '')[0] || '',
          trailingSpace =
            (leadingSpace ? (token.text.substr(leadingSpace.length).match(/\s$/) || '')[0] : '') ||
            '',
          textSlice = token.text.substr(
            leadingSpace.length,
            token.text.length - leadingSpace.length - trailingSpace.length,
          );
        return (
          `<span md-inline='code' spellcheck='${File.option.spellcheckForCodeAndLink || false}' class='md-pair-s'><span class='md-meta md-before'>` +
          token.pattern +
          leadingSpace +
          '</span><code>' +
          utilities.escapeForPreWrap(textSlice, false, true) +
          "</code><span class='md-meta md-after'>" +
          trailingSpace +
          token.pattern +
          '</span></span>'
        );
      case NodeType.del:
        return (
          "<span md-inline='del' class='md-pair-s'><span class='md-meta md-before'>" +
          token.pattern +
          '</span><del>' +
          token.inner +
          "</del><span class='md-meta md-after'>" +
          token.pattern +
          '</span></span>'
        );
      case NodeType.autolink:
        return `<span md-inline='autolink' class='md-link' spellcheck='${File.option.spellcheckForCodeAndLink || false}'><span class='md-meta md-before'>&lt;</span><a href='${encodeLinkUrl(token.href)}' class="md-url">${utilities.escape(token.text)}</a><span class='md-meta md-after'>&gt;</span></span>`;
      case NodeType.url:
        return `<span md-inline='url' class='md-link md-pair-s' spellcheck='${File.option.spellcheckForCodeAndLink || false}'><a href='${encodeLinkUrl(token.href)}'>${utilities.escape(token.text)}</a></span>`;
      case NodeType.br:
        return (
          "<span md-inline='br' class='md-br md-tag' spellcheck='false'><span class='md-br-content md-raw-inline'>" +
          utilities.escapeForPreWrap(token.text, false, true) +
          '</span></span>'
        );
      case NodeType.comment:
        return (
          `<span md-inline='comment' class='md-comment' spellcheck='${File.option.spellcheckForCodeAndLink || false}'>` +
          utilities.escapeForPreWrap(token.text, false, true) +
          '</span>'
        );
      case NodeType.underline:
        return (
          "<span md-inline='underline' class='md-pair-s'><span class='md-meta md-before md-raw-inline'>&lt;u&gt;</span><u>" +
          token.inner +
          "</u><span class='md-meta md-after md-raw-inline'>&lt;/u&gt;</span></span>"
        );
      case NodeType.alert_text:
        return (
          `<span md-inline='alert_text' class='md-alert-text md-alert-text-${token.inner}'>` +
          `<span class='md-alert-text-container' data-text="${token.inner}">${renderAlertIcon(token.inner)}</span>` +
          "<span class='md-meta md-after md-content' contenteditable='true'>" +
          token.text +
          '</span></span>'
        );
      case NodeType.ruby:
        return (
          "<span md-inline='ruby' class='md-ruby'><span contenteditable='false' class='md-ruby-container'>" +
          domPurifyExport.sanitize(
            token.text,
            htmlBlocks.getDomPurifyConfig(htmlBlocks.INLINE_CONFIG),
          ).innerHTML +
          "</span><span class='md-meta md-content md-raw-inline'>" +
          utilities.escape(token.text) +
          '</span></span>'
        );
      case NodeType.html_inline:
        var sanitizedParts = [''];
        if (!token.isMeta) {
          sanitizedParts = (function (htmlToken) {
            var element = domPurifyExport.sanitize(
              htmlToken.before + '' + htmlToken.after,
              htmlBlocks.getDomPurifyConfig(htmlBlocks.INLINE_CONFIG),
            );
            element.querySelectorAll('a').forEach(function (inputElement) {
              if ('#' == (inputElement.getAttribute('href') || '')[0]) {
                inputElement.classList.add('md-inner-link');
              }
            });
            var html = element.innerHTML.replace('', htmlToken.inner);
            element.innerHTML = html;
            if (
              '' != (void 0 === element.textContent ? element.innerText : element.textContent) ||
              element.querySelector('img, svg, video, audio')
            ) {
              return [html, html];
            } else {
              return [html, ''];
            }
          })(token);
        }
        if (sanitizedParts[1]) {
          return (
            `<span md-inline='html_inline' class='md-html-inline' spellcheck='${File.option.spellcheckForCodeAndLink || false}'>` +
            "<span class='md-meta md-before md-raw-inline'>" +
            utilities.escapeForPreWrap(token.before, false, true) +
            '</span>' +
            sanitizedParts[0] +
            "<span class='md-meta md-after md-raw-inline'>" +
            utilities.escapeForPreWrap(token.after, false, true) +
            '</span></span>'
          );
        } else {
          return (
            "<span md-inline='html_inline' class='md-html-inline md-raw-inline' spellcheck='false'>" +
            (sanitizedParts[0] || '') +
            "<span class='md-raw-inline'>" +
            utilities.escapeForPreWrap(token.before, false, true) +
            token.inner +
            utilities.escapeForPreWrap(token.after, false, true) +
            '</span></span>'
          );
        }
      case NodeType.tag:
        return (
          "<span md-inline='tag' class='md-tag md-raw-inline' spellcheck='false'>" +
          utilities.escapeForPreWrap(token.text, false, true) +
          '</span>'
        );
      case NodeType.atag:
        return (
          "<span md-inline='atag' class='md-atag'><span class='md-meta md-before md-raw-inline'>" +
          utilities.escapeForPreWrap(token.left, false, true) +
          "</span><a href='" +
          encodeLinkUrl(token.href) +
          "' " +
          ('#' == token.href[0] ? "class='md-inner-link'" : '') +
          '>' +
          token.inner +
          "</a><span class='md-meta md-after md-raw-inline'>" +
          utilities.escapeForPreWrap(token.right, false, true) +
          '</span></span>'
        );
      case NodeType.link:
        var linkMetadataHtml = token.meta.replace(
          /^\((<?(?:\([^)]*\)|[^()])*?>?)(?:([ \t]+)((['"])((?:.|\n)*?)\4))?([ \t]*)\)/,
          function (
            unusedParameter1,
            linkTarget,
            titleSpacing,
            quotedTitle,
            unusedParameter5,
            unusedParameter6,
            trailingSpacing,
          ) {
            return (
              `(</span><span class='md-content md-url' spellcheck='${File.option.spellcheckForCodeAndLink || false}' >` +
              utilities.escape(linkTarget) +
              "</span><span class='md-meta'>" +
              utilities.escape(titleSpacing) +
              "</span><span class='md-content md-link-title'>" +
              utilities.escape(quotedTitle) +
              "</span><span class='md-meta md-after'>" +
              utilities.escape(trailingSpacing) +
              ')</span>'
            );
          },
        );
        return (
          "<span md-inline='link' class='md-meta-i-c " +
          (token.inner ? '' : 'md-empty-link') +
          " md-link'><span class='md-meta md-before md-meta-i'>[</span><a " +
          ('#' == token.href[0] ? "class='md-inner-link'" : '') +
          " href='" +
          encodeLinkUrl(token.href) +
          "' " +
          (token.title ? "title='" + utilities.escapeForPreWrap(token.title) + "' " : '') +
          '>' +
          token.inner +
          "</a><span class='md-meta md-before'>]" +
          linkMetadataHtml +
          '</span>'
        );
      case NodeType.imgtag:
        return decorateInlineToken(token, token.text, token.href);
      case NodeType.refimg:
        return decorateInlineToken(token, token.markdown, token.ref || token.text);
      case NodeType.image:
        return decorateInlineToken(token, token.markdown, token.href, token.components);
      case NodeType.footnote:
        return (
          "<sup md-inline='footnote' class='md-footnote' data-ref='" +
          utilities.escape(token.text.trim()).toLowerCase() +
          "'><span class='md-meta md-before '>[^</span><span class='md-text' spellcheck='false'>" +
          token.inner +
          "</span><span class='md-meta md-after'>]</span></sup>"
        );
      case NodeType.escape:
        return (
          "<span md-inline='escape'><span class='md-meta md-before'>\\</span>" +
          utilities.escape(token.text) +
          '</span>'
        );
      case NodeType.reflink:
        return (
          "<span md-inline='reflink' class='md-link md-meta-i-c'><span class='md-meta md-before md-meta-i'>[</span><a data-ref='" +
          utilities.escapeForPreWrap(token.ref || token.text) +
          "' href='#'>" +
          token.inner +
          "</a><span class='md-meta md-after'>]</span><span class='md-meta md-before'>[</span><span class='md-content' spellcheck='false'>" +
          token.ref +
          "</span><span class='md-meta md-after'>]</span></span>"
        );
      case NodeType.attr:
        return "<span md-inline='attr' class='md-attr'>" + utilities.escape(token.text) + '</span>';
      case NodeType.emoji:
        return (
          "<span md-inline='emoji' data-content='" +
          token.text +
          "' class='md-emoji' ><span class='md-emoji-control-ch'>​</span><span data-emoji='" +
          token.inner +
          "' class='md-emoji-span'></span><span class='md-meta'>:" +
          token.text +
          ":</span><span class='md-emoji-control-ch'>​</span></span>"
        );
      case NodeType.inline_math:
        mathSequence++;
        token.text = token.text.replace(/\u200B+/g, '');
        let pattern = token.pattern,
          currentPattern = token.pattern;
        if (token.legacyMath) {
          pattern = '[' === token.legacyMath ? '\\[' : '\\(';
          currentPattern = '[' === token.legacyMath ? '\\]' : '\\)';
        }
        if (!/^\$+$/.exec(token.text) && svgCache[token.text.trim()]) {
          return `<span class='md-inline-math math-jax-postprocess' md-inline='inline_math' id='marklyra-mjx-${mathSequence}'><span class='md-before md-meta'>${pattern}</span><span class='md-inline-math-container' spellcheck='false'>${svgCache[token.text.trim()]}</span><span class='md-after md-meta'>${currentPattern}</span><span class='md-math-after-sym'></span></span>`;
        }
        var scriptElement = document.createElement('script');
        scriptElement.textContent = token.text;
        scriptElement.setAttribute('type', 'math/tex');
        return (
          `<span class='md-inline-math math-jax-preprocess' md-inline='inline_math' id='marklyra-mjx-${mathSequence}'><span class='md-before md-meta'>` +
          pattern +
          "</span><span class='md-math-tex md-inline-math-container'>" +
          $(scriptElement.outerHTML)[0].outerHTML +
          "</span><span class='md-after md-meta'>" +
          currentPattern +
          "</span><span class='md-math-after-sym'></span></span>"
        );
      case NodeType.subscript:
        return (
          "<sub md-inline='subscript' class='md-pair-s'><span class='md-meta md-before'>~</span>" +
          token.inner +
          "<span class='md-meta md-after'>~</span></sub>"
        );
      case NodeType.superscript:
        return (
          "<sup md-inline='superscript' class='md-pair-s'><span class='md-meta md-before'>^</span>" +
          token.inner +
          "<span class='md-meta md-after'>^</span></sup>"
        );
      case NodeType.html_entity:
        return (
          "<span md-inline='html_entity' data-content='" +
          token.text +
          "' class='md-entity'><span class='md-meta' spellcheck='false'>" +
          utilities.escape(token.text) +
          '</span></span>'
        );
      case NodeType.pants:
        var spacingClass = '',
          inner = token.inner;
        if (/^ /.exec(token.inner)) {
          token.inner = token.inner.trim();
          spacingClass = 'md-pants-space-before';
        } else {
          if (/ $/.exec(token.inner)) {
            token.inner = ' ';
            spacingClass = 'md-pants-space-after';
          }
        }
        return (
          "<span md-inline='pants' data-text='" +
          escapeAttributeText(token.text) +
          "' data-content='" +
          escapeAttributeText(inner) +
          "' class='md-pants " +
          spacingClass +
          "' data-desc='" +
          token.desc +
          "'><span class='md-meta-none' contenteditable='false'>" +
          (token.meta || '') +
          '</span>' +
          token.inner +
          '</span>'
        );
      case NodeType.tab:
        return "<span md-inline='tab' class='md-tab'>" + token.inner + '</span>';
      case NodeType.linebreak:
        return (
          "<span md-inline='linebreak' class='md-linebreak'>  <span class='md-linebreak-mark'></span>\n" +
          (token.isLast ? '<br/>' : '') +
          '</span>'
        );
      case NodeType.emptyline:
        if (File.option.ignoreLineBreak) {
          return "<span md-inline='softbreak' class='md-softbreak md-softbreak-emptyline'><span contenteditable='false'></span>\n</span>";
        } else {
          return "&#10;<span md-inline='emptyline' class='md-emptyline'>&#10;</span>";
        }
      case NodeType.softbreak:
        return (
          "<span md-inline='softbreak' class='md-softbreak'>" +
          (File.option.ignoreLineBreak ? "<span contenteditable='false'></span>" : '') +
          '\n</span>'
        );
      default:
        console.sendError('unknow type ' + token.type);
        return token.text;
    }
  };
  moduleExports.decorateImage = decorateInlineToken;
}
