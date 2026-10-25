// ui/dialogs.
// SystemJS module 29. Dependencies: e, 13, 11.
$__System.registerDynamic(
  '29',
  ['e', '13', '11'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var jquery = requireModule('e'),
      utilities = (requireModule('13').Node, requireModule('11'));
    var ignoreSyntheticClick = !1;
    function a(inputText, headingsOnly) {
      if (inputText.match(/^#/)) {
        if (!headingsOnly) {
          var explicitAnchors = jquery(
            "#write [name='@'],[marklyra-id='@'],mjx-container g[id='@']".replace(
              /@/g,
              utilities.escapeSelector(inputText.substr(1)),
            ),
          );
          if (explicitAnchors.length) return [explicitAnchors, void 0];
        }
        var exactHeading,
          [fullAnchor, baseAnchor, duplicateIndex] = (function (callbackText) {
            var text = callbackText,
              match = /-(\d+)$/.exec(callbackText);
            return (
              match &&
                ((match = match[1]),
                (text = callbackText.substr(0, callbackText.length - 1 - match.length)),
                (match -= 0)),
              [callbackText, text, match]
            );
          })(utilities.titleToAnchor(inputText.substr(1) || '')),
          remainingMatches = duplicateIndex || 1,
          filteredItems = jquery('#write')
            .find('h1, h2, h3, h4, h5, h6')
            .filter(function () {
              var text = this.textContent,
                visibleHeadingText = jquery(this).contentText(),
                headingAnchor = utilities.titleToAnchor(text);
              return headingAnchor == baseAnchor ||
                headingAnchor == utilities.decodeFromEscapedPath(baseAnchor)
                ? !--remainingMatches
                : text == visibleHeadingText ||
                    ((visibleHeadingText = utilities.titleToAnchor(visibleHeadingText)) !=
                      baseAnchor &&
                      visibleHeadingText != utilities.decodeFromEscapedPath(baseAnchor))
                  ? (headingAnchor == fullAnchor ||
                    headingAnchor == utilities.decodeFromEscapedPath(fullAnchor)
                      ? (exactHeading = jquery(this))
                      : text != visibleHeadingText &&
                        (((visibleHeadingText = utilities.titleToAnchor(visibleHeadingText)) !=
                          fullAnchor &&
                          visibleHeadingText != utilities.decodeFromEscapedPath(fullAnchor)) ||
                          (exactHeading = jquery(this))),
                    !1)
                  : !--remainingMatches;
            });
        return (exactHeading || []).length
          ? [exactHeading, 0]
          : [filteredItems, duplicateIndex > 1 ? duplicateIndex : 0];
      }
      return [void 0, void 0];
    }
    var dateInstance,
      currentElement = jquery('#marklyra-tooltip');
    jquery('body')
      .on('mouseenter', '[marklyra-hint]', function () {
        var element = jquery(this),
          beforeShowEvent = jquery.Event('before-show-marklyra-hint', { cancel: !1 });
        if ((element.trigger(beforeShowEvent), !beforeShowEvent.cancel)) {
          currentElement
            .text(this.getAttribute('marklyra-hint'))
            .addClass('shown')
            .attr('style', ''),
            this.getAttribute('marklyra-hint-html') &&
              currentElement.html(this.getAttribute('marklyra-hint'));
          var bounds = this.getBoundingClientRect(),
            currentBounds = { left: bounds.left, top: bounds.top },
            clientWidth = currentElement[0].clientWidth,
            anchorCenter = currentBounds.left + this.clientWidth / 2;
          'right' == element.attr('marklyra-hint-pos')
            ? (currentBounds.left += this.clientWidth + 4)
            : 'left' == element.attr('marklyra-hint-pos')
              ? (currentBounds.left -= this.clientWidth + 4)
              : (currentBounds.top > window.innerHeight / 2
                  ? (currentBounds.top = currentBounds.top - currentElement[0].clientHeight - 6)
                  : (currentBounds.top += bounds.height + 1),
                clientWidth / 2 + anchorCenter > window.innerWidth
                  ? (currentBounds.left = window.innerWidth - clientWidth - 4)
                  : ((currentBounds.left = anchorCenter - clientWidth / 2 - 2),
                    (currentBounds.left = Math.max(2, currentBounds.left)))),
            currentElement.offset(currentBounds),
            new Date() - dateInstance < 2e3 || this.getAttribute('marklyra-hint-instant')
              ? currentElement.addClass('instant')
              : currentElement.removeClass('instant');
        }
      })
      .on('mouseleave click', '[marklyra-hint]', function () {
        (dateInstance = new Date()), currentElement.removeClass('shown');
      });
    var suppressionKey,
      suppressionHandlerBound = !1;
    function u(inputKey, modeName, inputFocus) {
      h({
        key: inputKey,
        title: jquery.localize
          .getString('<strong>%@</strong> has been turned on.', 'Front')
          .replace('%@', jquery.localize.getString(modeName, 'Menu')),
        body: jquery.localize.getString('You could turn it off from `View` menu.', 'Front'),
        focus: inputFocus,
      });
    }
    function h(warningOptions) {
      var {
        key: preferenceKey,
        title: warningTitle,
        body: warningBody,
        focus: focusTarget,
        checked: initialChecked,
      } = warningOptions;
      if (!File.option[preferenceKey]) {
        console.debug(preferenceKey, File.option[preferenceKey]);
        var innerText = document.querySelector('#marklyra-enter-mode-warning-temp').innerText,
          notification = jquery('#md-notification');
        return (
          notification
            .html(innerText)
            .find('.marklyra-enter-mode-warning-header')
            .html(warningTitle)
            .end()
            .find('.marklyra-enter-mode-warning-body')
            .html(warningBody || '&nbsp;')
            .end()
            .find("[data-lg='Front']")
            .localize('Front', jquery.localize.localeOption)
            .end()
            .find("[data-lg='Panel']")
            .localize('Panel', jquery.localize.localeOption)
            .end(),
          document.body.classList.add('marklyra-show-notification'),
          focusTarget && notification.focus(),
          (suppressionKey = preferenceKey),
          preferenceKey
            ? (suppressionHandlerBound ||
                ((suppressionHandlerBound = !0),
                jquery('#md-notification')
                  .on('change', '#marklyra-suppress-mode-warning-input', function () {
                    var checked = jquery(this).prop('checked');
                    JSBridge.putSetting(suppressionKey, checked),
                      JSBridge.execForAll('File.option.' + suppressionKey + '=' + checked + ';');
                  })
                  .on('click', '#marklyra-suppress-mode-warning-close-btn', function () {
                    document.body.classList.remove('marklyra-show-notification');
                  })),
              initialChecked
                ? jquery('#marklyra-suppress-mode-warning-input')
                    .prop('checked', !0)
                    .trigger('change')
                : jquery('#marklyra-suppress-mode-warning-input').prop('checked', !1))
            : (notification.find('label').remove(),
              notification.one('click', '#marklyra-suppress-mode-warning-close-btn', function () {
                document.body.classList.remove('marklyra-show-notification');
              })),
          notification
        );
      }
    }
    var timerId,
      f = function () {
        (this.$dialog = jquery('#common-dialog')),
          (this.isShown_ = !1),
          (this.callback_ = null),
          (this.checkBoxState = null),
          this.init();
      };
    (f.prototype.isShown = function () {
      return this.isShown_;
    }),
      (f.prototype.init = function () {
        var receiver = this;
        this.$dialog
          .on('change', '#common-dialog-checkbox', function () {
            return (receiver.checkBoxState = jquery(this).prop('checked')), !1;
          })
          .on('click', '.modal-footer button', function () {
            if (receiver.callback_) {
              if (
                (receiver.callback_(jquery(this).prevAll('button').length, receiver.checkBoxState),
                this.classList.contains('btn-light'))
              )
                return !1;
              receiver.callback_ = null;
            }
          })
          .on('hidden.bs.modal', function () {
            receiver.callback_ && receiver.callback_(null);
          });
      }),
      (f.prototype.show = function (dialogOptions) {
        this.isShown_ && this.hide(),
          (this.callback_ = dialogOptions.callback || function () {}),
          this.render_(dialogOptions),
          this.$dialog.modal(dialogOptions);
      }),
      (f.prototype.render_ = function (dialogOptions) {
        var $dialog = this.$dialog;
        $dialog.removeClass('error-dialog'),
          $dialog.attr('data-tag', dialogOptions.tag),
          'error' == dialogOptions.type && $dialog.addClass('error-dialog'),
          dialogOptions.title
            ? ($dialog.removeClass('marklyra-dialog-no-title'),
              $dialog.find('.modal-title').text(dialogOptions.title))
            : $dialog.addClass('marklyra-dialog-no-title'),
          (dialogOptions.html
            ? $dialog.find('#common-dialog-message').html(dialogOptions.html)
            : $dialog.find('#common-dialog-message').text(dialogOptions.message || '')
          ).css('text-align', dialogOptions.leftAlign ? 'left' : ''),
          dialogOptions.checkbox
            ? ($dialog.addClass('marklyra-dialog-show-checkbox'),
              $dialog
                .find('#common-dialog-checkbox')
                .prop('checked', dialogOptions.checkbox.state || !1),
              $dialog.find('#common-dialog-checkbox-label').text(dialogOptions.checkbox.label))
            : $dialog.removeClass('marklyra-dialog-show-checkbox'),
          (function () {
            (dialogOptions.buttons = dialogOptions.buttons || [jquery.localize.getString('Close')]),
              (dialogOptions.helperButtons = dialogOptions.helperButtons || []);
            var buttonTemplate = jquery(
                '<button type="button" data-dismiss="modal" class="btn"></button>',
              ),
              footer = $dialog.find('.modal-footer').html('');
            3 == dialogOptions.buttons.length
              ? $dialog.addClass('marklyra-three-way-buttons')
              : $dialog.removeClass('marklyra-three-way-buttons'),
              dialogOptions.helperButtons.forEach(function (item, unusedParameter2) {
                var element = buttonTemplate.clone();
                element.text(item),
                  element.addClass('btn-light'),
                  element[0].removeAttribute('data-dismiss'),
                  footer.append(element);
              }),
              dialogOptions.buttons.forEach(function (item, itemIndex) {
                var element = buttonTemplate.clone();
                element.text(item),
                  0 == itemIndex
                    ? element.addClass('btn-primary')
                    : element.addClass('btn-default'),
                  footer.append(element);
              });
          })();
      }),
      (f.prototype.hide = function () {
        this.isShown_ = !1;
      });
    var currentTimerId,
      g = function () {
        timerId && clearTimeout(timerId),
          (timerId = null),
          document.body.classList.remove('marklyra-show-notification');
      },
      v = function (message, allowHtml, buttons, onButton, autoHideOptions) {
        timerId && clearTimeout(timerId), (timerId = null);
        var items = buttons || [];
        items && 'string' == typeof items && (items = [items]);
        var notification = jquery('#md-notification').html(
          `<div class="md-notification-content"><p style='padding-right: 0;overflow-wrap: anywhere;max-height: 60vh;overflow-y: auto;'>${allowHtml ? message : utilities.escape(message)}</p>` +
            (items.length
              ? items
                  .map(
                    (item, itemIndex) =>
                      `<span data-index='${itemIndex}' class='btn-default btn-xs btn'>${item}</span>`,
                  )
                  .join(' ')
              : '') +
            `<span class='${items.length ? '' : 'btn-default'} btn-xs btn ok-btn'>${jquery.localize.getString('Close')}</span></div>`,
        );
        return (
          document.body.classList.add('marklyra-show-notification'),
          items.length &&
            jquery('.btn-default').one('click', function () {
              g(), onButton && onButton(this.dataset.index - 0);
            }),
          autoHideOptions &&
            (autoHideOptions.checkFocus
              ? document.hasFocus() && (timerId = setTimeout(g, autoHideOptions.timeout || 1e4))
              : (timerId = setTimeout(g, autoHideOptions.timeout || 1e4))),
          notification
        );
      },
      y = function (domNode) {
        if (!domNode) return domNode;
        var t = function (domNode) {
            return domNode.childNodes && 0 == domNode.childNodes.length
              ? domNode
              : t(domNode.childNodes[0]);
          },
          nextSibling = domNode.nextSibling;
        return null == nextSibling ? y(domNode.parentElement) : t(nextSibling);
      },
      b = function (container) {
        for (
          var domNode, childNodesLength = container.childNodes.length, items = [], itemIndex = 0;
          itemIndex < childNodesLength;
          itemIndex++
        ) {
          var currentDomNode = container.childNodes[itemIndex];
          currentDomNode.tagName
            ? domNode
              ? domNode.tagName != currentDomNode.tagName ||
                currentDomNode.childElementCount ||
                domNode.childElementCount ||
                domNode.getAttribute('class') != currentDomNode.getAttribute('class')
                ? (domNode = currentDomNode)
                : (items.push(currentDomNode),
                  (domNode.textContent = domNode.textContent + currentDomNode.textContent))
              : (domNode = currentDomNode)
            : (domNode = null);
        }
        items.forEach(function (item) {
          container.removeChild(item);
        });
      },
      w = function (message, onConfirm, onCancel) {
        window.reqnode
          ? JSBridge.invoke('dialog.showMessageBox', {
              title: jquery.localize.getString('Confirm'),
              message: message,
              type: 'question',
              defaultId: 0,
              cancelId: 1,
              buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
            }).then(({ response: buttonIndex }) => {
              0 == buttonIndex ? onConfirm() : onCancel && onCancel();
            })
          : window.confirm(message)
            ? onConfirm()
            : onCancel && onCancel();
      },
      zoomControlsUnbound = !0,
      C = function (zoomFactor) {
        zoomControlsUnbound &&
          ((zoomControlsUnbound = !1),
          jquery('#zoom-hint')
            .on('click', '#zoom-hint-in', function () {
              JSBridge.zoom.zoomOut();
            })
            .on('click', '#zoom-hint-out', function () {
              JSBridge.zoom.zoomIn();
            })
            .on('click', '#zoom-hint-reset', function () {
              JSBridge.zoom.resetZoom();
            })),
          jquery('#zoom-hint-current').text((100 * zoomFactor + '').replace(/\..+/, '') + '%'),
          currentTimerId && clearTimeout(currentTimerId),
          jquery('#zoom-hint').show(),
          document.body.classList.add('on-zoom'),
          (currentTimerId = setTimeout(function () {
            (currentTimerId = null),
              jquery('#zoom-hint').hide(),
              document.body.classList.remove('on-zoom');
          }, 3e3));
      },
      dialog = new f(),
      showDialog = dialog.show.bind(dialog);
    (moduleExports.dialog = dialog),
      (moduleExports.showDialog = showDialog),
      (window.showDialog = showDialog),
      (moduleExports.showNativeDialog = function (dialogOptions) {
        File.isMac
          ? window.bridge.callHandler(
              'window.showDialog',
              {
                message: dialogOptions.message,
                checkbox: dialogOptions.checkbox || '',
                buttons: dialogOptions.buttons || [],
              },
              function (dialogResult) {
                dialogOptions.callback(dialogResult[0], dialogResult[1]);
              },
            )
          : (dialogOptions.checkbox && (dialogOptions.checkbox = { label: dialogOptions.checkbox }),
            dialog.show(dialogOptions));
      }),
      (moduleExports.showErrorDialog = function (title, message) {
        console.debug('EditHelper.showErrorDialog'),
          window.reqnode
            ? JSBridge.invoke('dialog.showMessageBox', {
                type: 'error',
                title: jquery.localize.getString('Error'),
                message: jquery.localize.getString(title, 'Panel'),
                detail: jquery.localize.getString(message, 'Panel'),
                buttons: [jquery.localize.getString('OK')],
              })
            : alert(
                jquery.localize.getString(title, 'Panel') +
                  '\n' +
                  jquery.localize.getString(message, 'Panel'),
              );
      }),
      (moduleExports.showWarningDialog = function (message, showSuppressionCheckbox) {
        var checkboxLabel = showSuppressionCheckbox
          ? jquery.localize.getString('Do not show this again', 'Panel')
          : '';
        return window.reqnode
          ? JSBridge.invoke('dialog.showMessageBox', {
              type: 'question',
              message: message,
              defaultId: 0,
              cancelId: 1,
              buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
              checkboxLabel: checkboxLabel,
            })
          : File.isMac
            ? new Promise((resolvePromise) => {
                window.bridge.callHandler(
                  'window.showDialog',
                  {
                    message: message,
                    checkbox: checkboxLabel,
                    buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
                  },
                  function (dialogResult) {
                    resolvePromise({ response: dialogResult[0], checkboxChecked: dialogResult[1] });
                  },
                );
              })
            : void 0;
      }),
      (moduleExports.showNotificationWithTitle = function (
        title,
        message,
        buttons,
        onButton,
        autoHideOptions,
      ) {
        (message = message || '').trim || (message = message.message || '');
        var detailHtml = message
            ? `<br/><span class='md-notification-detail'>${utilities.escape(message.trim().replace(/\n[\s\S]*/, ''))}</span>`
            : message,
          titleHtml = message
            ? '<strong>' + utilities.escape(title) + '</strong>'
            : utilities.escape(title),
          elements = v(titleHtml + detailHtml, !0, buttons, onButton, autoHideOptions).find(
            '.md-notification-detail',
          );
        elements.length &&
          ((elements[0].scrollWidth > elements[0].offsetWidth ||
            message.trim().indexOf('\n') > -1) &&
            elements.after(
              "<a id='md-notification-more-btn' class='btn-xs btn'>{label}</a>".replace(
                '{label}',
                jquery.localize.getString('View More', 'Panel'),
              ),
            ),
          jquery('#md-notification-more-btn')
            .off('click')
            .on('click', function () {
              showDialog({
                message: message,
                tag: 'detail',
                helperButtons: [jquery.localize.getString('Copy', 'Menu')],
                callback: function (buttonIndex) {
                  0 == buttonIndex && File.editor.UserOp.setClipboard(null, null, message, !0);
                },
              });
            }));
      }),
      (moduleExports.showNotification = v),
      (window.showNotification = v),
      (moduleExports.showProcessingNotification = function (message, disableAnimation) {
        jquery('#md-notification').html(
          [
            '<p>' + jquery.localize.getString(message, 'Panel'),
            '\n<div class="marklyra-search-spinner marklyra-export-spinner" style="margin-right:16px;top:8px">',
            '<div class="rect1"></div>',
            '<div class="rect2"></div>',
            '<div class="rect3"></div>',
            '<div class="rect4"></div>',
            '<div class="rect5"></div>',
            '</div></p>',
          ].join(''),
        ),
          document.body.classList.add('marklyra-show-notification'),
          disableAnimation
            ? document.body.classList.add('marklyra-notification-no-animation')
            : document.body.classList.remove('marklyra-notification-no-animation');
      }),
      (moduleExports.hideNotification = g),
      (moduleExports.confirm = w),
      (moduleExports.confirmWithPromise = function (message) {
        return new Promise((resolvePromise) => {
          w(
            message,
            () => {
              resolvePromise(!0);
            },
            () => {
              resolvePromise(!1);
            },
          );
        });
      }),
      (moduleExports.showZoomPanel = C),
      (moduleExports.replaceTag = function (sourceElement, tagName) {
        var outerHTML = sourceElement[0].outerHTML,
          regex = new RegExp('<' + sourceElement[0].tagName, 'i'),
          text = outerHTML.replace(regex, '<' + tagName);
        (regex = new RegExp('</' + sourceElement[0].tagName + '>$', 'i')),
          (text = text.replace(regex, '</' + tagName + '>'));
        var replacementElement = jquery(text);
        return sourceElement.replaceWith(replacementElement), replacementElement;
      }),
      (moduleExports.getEditParent = function (unusedParameter1, documentNode) {
        return documentNode.getClosetBlock(!0);
      }),
      (moduleExports.fixPopoverPosition = function (
        anchorElement,
        popoverOrSelector,
        compactSpacing,
      ) {
        var currentElements,
          offset = anchorElement.offset(),
          left = jquery(editor.sessionStr).offset().left + 10,
          editorWidth = jquery(editor.sessionStr).width(),
          elements = anchorElement.find('.md-arrow');
        return (
          (popoverOrSelector = popoverOrSelector || '.code-tooltip.md-hover-tip').jquery
            ? (elements = (currentElements = popoverOrSelector).find('.md-arrow'))
            : (currentElements = anchorElement.find(popoverOrSelector)),
          anchorElement.length
            ? (currentElements.css('max-width', editorWidth - 60),
              (offset.top +=
                anchorElement.height() * (compactSpacing ? 1 : 1.5) + (compactSpacing ? 0 : 4)),
              (offset.left += (anchorElement.width() - currentElements.width()) / 2),
              offset.left + currentElements.width() > window.innerWidth - 10
                ? (offset.left = window.innerWidth - 10 - currentElements.width())
                : offset.left < left && (offset.left = left),
              currentElements.css('position', 'absolute').offset(offset),
              !compactSpacing &&
                elements.offset(function (unusedParameter1, arrowOffset) {
                  var bounds = {};
                  return (
                    (bounds.left = anchorElement.offset().left + anchorElement.width() / 2),
                    (bounds.top = arrowOffset.top),
                    bounds
                  );
                }),
              currentElements)
            : (console.sendError('cannot fixPopoverPosition on empty $parent'),
              currentElements.hide())
        );
      }),
      (moduleExports.resetClick = function (keyboardEvent) {
        var currentEditor = File.editor;
        if (ignoreSyntheticClick) return !(ignoreSyntheticClick = !1);
        if (
          keyboardEvent.target &&
          ('CONTENT' == keyboardEvent.target.tagName || 'HTML' == keyboardEvent.target.tagName)
        ) {
          var clientX = keyboardEvent.clientX,
            clientY = keyboardEvent.clientY,
            element = document.querySelector(currentEditor.sessionStr),
            offset = jquery(element).offset();
          if (!offset) return;
          var replayedClick = document.createEvent('MouseEvents'),
            left = offset.left,
            rightEdge = offset.left + element.clientWidth,
            top = offset.top,
            bottomEdge = offset.top + element.clientHeight;
          if (
            (clientX >= left && clientX <= rightEdge) ||
            (clientY >= top && clientY <= bottomEdge)
          )
            return;
          if (
            ((ignoreSyntheticClick = !0),
            (clientX =
              clientX < offset.left ? offset.left + 1 : offset.left + element.clientWidth - 1),
            (clientY =
              clientY < offset.top ? offset.top + 1 : offset.top + element.clientHeight - 1),
            keyboardEvent.stopPropagation(),
            (replayedClick = document.createEvent('MouseEvents')),
            !(element = document.elementFromPoint(clientX, clientY)))
          )
            return;
          replayedClick.initMouseEvent(
            'click',
            !0,
            !0,
            element.ownerDocument.defaultView,
            1,
            keyboardEvent.screenX + (clientX - keyboardEvent.clientX),
            keyboardEvent.screenY + (clientY - keyboardEvent.clientY),
            clientX,
            clientY,
            keyboardEvent.ctrlKey,
            keyboardEvent.altKey,
            keyboardEvent.shiftKey,
            keyboardEvent.metaKey,
            keyboardEvent.button,
          ),
            element.dispatchEvent(replayedClick);
        }
      }),
      (moduleExports.getWordCount = function (text) {
        if (0 === text.trim().length) return 0;
        var cjkCharacterCount = 0,
          partsLength = [
            'd',
            text
              .replace(/[\u3040-\uABFF\uD7A4-\uFAFF]/gi, function (unusedParameter1) {
                return cjkCharacterCount++, ' ';
              })
              .replace(/(^|\s+)[(\u3000-\u303F)!-\/:-@\[-`{-~]+(\s+|$)/gm, ' '),
            'd',
          ]
            .join(' ')
            .split(/[(\u3000-\u303F)\s!-,\.\\:-@\[-`{-~]+/g).length;
        return cjkCharacterCount + partsLength - 2;
      }),
      (moduleExports.findAnchorElem = function (anchor, headingsOnly) {
        return a(anchor, headingsOnly)[0];
      }),
      (moduleExports.normalizeAnchor = function (anchor, items, reserveWriteAnchor) {
        var [headingElements, duplicateIndex] = a(anchor, !0);
        return (
          (anchor = headingElements.length
            ? '#' + utilities.titleToAnchor(headingElements[0].innerText)
            : anchor),
          0 === duplicateIndex
            ? items && items.filter((item) => item == anchor).length > 1
              ? (duplicateIndex = 1)
              : reserveWriteAnchor && 'write' == anchor && (duplicateIndex = 1)
            : headingElements || (duplicateIndex = void 0),
          anchor + (duplicateIndex ? '-' + duplicateIndex : '')
        );
      }),
      (moduleExports.fetchAnchorList = function (anchorMap, allowWriteAnchor) {
        var items = [];
        return (
          Array.prototype.slice
            .call(
              document.querySelectorAll('.md-html-inline a[name], .md-htmlblock-container a[name]'),
            )
            .map(function (element) {
              var explicitAnchor = utilities.decodeFromEscapedPath(
                (element.getAttribute('name') || '').substring(1),
              );
              items.push(explicitAnchor);
            }),
          Array.prototype.slice
            .call(document.querySelectorAll('.md-heading[cid]'))
            .map(function (element) {
              var nodeId = element.getAttribute('cid');
              if (!anchorMap[nodeId]) {
                var headingAnchor = utilities.titleToAnchor(element.innerText),
                  duplicateCount = (function (anchor) {
                    for (var matchCount = 0, itemIndex = 0; itemIndex < items.length; itemIndex++)
                      items[itemIndex].toLowerCase() == anchor && matchCount++;
                    return matchCount;
                  })(headingAnchor);
                items.push(headingAnchor),
                  duplicateCount
                    ? (anchorMap[nodeId] = headingAnchor + '-' + (duplicateCount + 1))
                    : ((function (anchor) {
                        return !allowWriteAnchor && 'write' == anchor;
                      })(headingAnchor) && (headingAnchor += '-1'),
                      (anchorMap[nodeId] = headingAnchor));
              }
            }),
          items
        );
      }),
      (moduleExports.keyOnControl = function (keyName, keyboardEvent, respectEditorFocus) {
        var element, localElement, focusedIndex;
        function s(respectEditorFocus) {
          var dialogElements = jquery('.modal-dialog:visible');
          if (!dialogElements.length) {
            if (respectEditorFocus) {
              var writingArea = document.querySelector('#write');
              if (
                writingArea == document.activeElement ||
                writingArea.contains(document.activeElement)
              )
                return dialogElements;
              dialogElements = jquery('.marklyra-show-notification #md-notification');
            }
            dialogElements = jquery('.marklyra-show-notification #md-notification');
          }
          return dialogElements;
        }
        if ('Tab' == keyName) {
          if ((element = s(respectEditorFocus)).length)
            return (
              (focusedIndex = (localElement = element.find(
                'button, input:not(#common-dialog-checkbox), .marklyra-dialog-show-checkbox #common-dialog-checkbox',
              )).index(document.activeElement)),
              localElement.length
                ? (keyboardEvent.shiftKey ? focusedIndex-- : focusedIndex++,
                  (focusedIndex = focusedIndex >= localElement.length ? 0 : focusedIndex),
                  (focusedIndex = Math.max(0, focusedIndex)),
                  localElement.eq(focusedIndex).focus(),
                  !0)
                : void 0
            );
        } else if ('Esc' == keyName)
          (element = s(!0)) && element.hasClass('modal-dialog')
            ? (1 == element.find('button').length && 1 == element.find('.btn-primary').length) ||
              element.parent().modal('hide')
            : document.body.classList.contains('marklyra-show-notification') &&
              document.body.classList.remove('marklyra-show-notification');
        else if ('Enter' == keyName && document.activeElement) {
          if (document.activeElement == document.body || 'DIV' == document.activeElement.tagName) {
            if ((element = s()).length)
              return element.find('button.btn-primary').eq(0).focus().trigger('click').length;
          } else if ('BUTTON' == document.activeElement.tagName)
            return jquery(document.activeElement).focus().trigger('click'), !0;
        } else if (
          ('Left' == keyName || 'Right' == keyName) &&
          (element = s()).length &&
          document.activeElement &&
          'BUTTON' == document.activeElement.tagName &&
          (focusedIndex = (localElement = element.find('button')).index(document.activeElement)) >
            -1
        )
          return (
            'Left' === keyName ? focusedIndex-- : focusedIndex++,
            (focusedIndex = focusedIndex >= localElement.length ? 0 : focusedIndex),
            (focusedIndex = Math.max(0, focusedIndex)),
            localElement.eq(focusedIndex).focus(),
            !0
          );
      }),
      (moduleExports.showTypeWriterModeWarning = function () {
        u('noWarnigForTypeWriterMode', 'Typewriter Mode');
      }),
      (moduleExports.showFocusModeWarning = function () {
        u('noWarnigForFocusMode', 'Focus Mode');
      }),
      (moduleExports.markRange = function (range, className) {
        var startContainer,
          startOffset,
          spanElement = document.createElement('span');
        spanElement.classList.add(className),
          (startContainer = range.startContainer),
          (startOffset = range.startOffset),
          startContainer &&
            startContainer.length === startOffset &&
            range.setStart(y(range.startContainer), 0);
        var endBlock =
          range.endContainer &&
          range.endContainer.parentElement &&
          range.endContainer.parentElement.closest('.md-entity');
        return (
          spanElement.appendChild(range.extractContents()),
          range.insertNode(spanElement),
          !endBlock || endBlock.innerText || endBlock.contains(spanElement) || endBlock.remove(),
          spanElement
        );
      }),
      (moduleExports.unmarkSpan = function (domNode) {
        var parentElement = domNode.parentElement;
        if (parentElement) {
          for (; domNode.firstChild; ) parentElement.insertBefore(domNode.firstChild, domNode);
          parentElement.removeChild(domNode),
            parentElement.getAttribute('md-inline') && b(parentElement),
            parentElement.normalize();
        }
      }),
      (moduleExports.mergeSameChildren = b),
      (moduleExports.showHintOrWarning = h),
      window._options &&
        window._options.zoomFactor &&
        1 != _options.zoomFactor &&
        (window._options.onFirstLaunch
          ? C(_options.zoomFactor)
          : document.body.classList.remove('on-zoom'));
  },
);
