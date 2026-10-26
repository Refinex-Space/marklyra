// ui/dialogs.
export default function initializeUiDialogs(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    utilities = (requireModule('model/document-model').Node, requireModule('shared/utilities'));
  var ignoreSyntheticClick = false;
  function findAnchorTarget(inputText, headingsOnly) {
    if (inputText.match(/^#/)) {
      if (!headingsOnly) {
        var explicitAnchors = jquery(
          "#write [name='@'],[marklyra-id='@'],mjx-container g[id='@']".replace(
            /@/g,
            utilities.escapeSelector(inputText.substr(1)),
          ),
        );
        if (explicitAnchors.length) {
          return [explicitAnchors, void 0];
        }
      }
      var exactHeading,
        [fullAnchor, baseAnchor, duplicateIndex] = (function (callbackText) {
          var text = callbackText,
            match = /-(\d+)$/.exec(callbackText);
          if (match) {
            match = match[1];
            text = callbackText.substr(0, callbackText.length - 1 - match.length);
            match -= 0;
          }
          return [callbackText, text, match];
        })(utilities.titleToAnchor(inputText.substr(1) || '')),
        remainingMatches = duplicateIndex || 1,
        filteredItems = jquery('#write')
          .find('h1, h2, h3, h4, h5, h6')
          .filter(function () {
            var text = this.textContent,
              visibleHeadingText = jquery(this).contentText(),
              headingAnchor = utilities.titleToAnchor(text);
            if (
              headingAnchor == baseAnchor ||
              headingAnchor == utilities.decodeFromEscapedPath(baseAnchor)
            ) {
              return !--remainingMatches;
            } else {
              if (
                text == visibleHeadingText ||
                ((visibleHeadingText = utilities.titleToAnchor(visibleHeadingText)) != baseAnchor &&
                  visibleHeadingText != utilities.decodeFromEscapedPath(baseAnchor))
              ) {
                if (
                  headingAnchor == fullAnchor ||
                  headingAnchor == utilities.decodeFromEscapedPath(fullAnchor)
                ) {
                  exactHeading = jquery(this);
                } else {
                  if (text != visibleHeadingText) {
                    if (
                      !(
                        (visibleHeadingText = utilities.titleToAnchor(visibleHeadingText)) !=
                          fullAnchor &&
                        visibleHeadingText != utilities.decodeFromEscapedPath(fullAnchor)
                      )
                    ) {
                      exactHeading = jquery(this);
                    }
                  }
                }
                return false;
              } else {
                return !--remainingMatches;
              }
            }
          });
      if ((exactHeading || []).length) {
        return [exactHeading, 0];
      } else {
        return [filteredItems, duplicateIndex > 1 ? duplicateIndex : 0];
      }
    }
    return [void 0, void 0];
  }
  var dateInstance,
    currentElement = jquery('#marklyra-tooltip');
  jquery('body')
    .on('mouseenter', '[marklyra-hint]', function () {
      var element = jquery(this),
        beforeShowEvent = jquery.Event('before-show-marklyra-hint', { cancel: false });
      element.trigger(beforeShowEvent);
      if (!beforeShowEvent.cancel) {
        currentElement.text(this.getAttribute('marklyra-hint')).addClass('shown').attr('style', '');
        if (this.getAttribute('marklyra-hint-html')) {
          currentElement.html(this.getAttribute('marklyra-hint'));
        }
        var bounds = this.getBoundingClientRect(),
          currentBounds = { left: bounds.left, top: bounds.top },
          clientWidth = currentElement[0].clientWidth,
          anchorCenter = currentBounds.left + this.clientWidth / 2;
        if ('right' == element.attr('marklyra-hint-pos')) {
          currentBounds.left += this.clientWidth + 4;
        } else {
          if ('left' == element.attr('marklyra-hint-pos')) {
            currentBounds.left -= this.clientWidth + 4;
          } else {
            if (currentBounds.top > window.innerHeight / 2) {
              currentBounds.top = currentBounds.top - currentElement[0].clientHeight - 6;
            } else {
              currentBounds.top += bounds.height + 1;
            }
            if (clientWidth / 2 + anchorCenter > window.innerWidth) {
              currentBounds.left = window.innerWidth - clientWidth - 4;
            } else {
              currentBounds.left = anchorCenter - clientWidth / 2 - 2;
              currentBounds.left = Math.max(2, currentBounds.left);
            }
          }
        }
        currentElement.offset(currentBounds);
        if (new Date() - dateInstance < 2e3 || this.getAttribute('marklyra-hint-instant')) {
          currentElement.addClass('instant');
        } else {
          currentElement.removeClass('instant');
        }
      }
    })
    .on('mouseleave click', '[marklyra-hint]', function () {
      dateInstance = new Date();
      currentElement.removeClass('shown');
    });
  var suppressionKey,
    suppressionHandlerBound = false;
  function showModeEnabledHint(inputKey, modeName, inputFocus) {
    showPreferenceWarning({
      key: inputKey,
      title: jquery.localize
        .getString('<strong>%@</strong> has been turned on.', 'Front')
        .replace('%@', jquery.localize.getString(modeName, 'Menu')),
      body: jquery.localize.getString('You could turn it off from `View` menu.', 'Front'),
      focus: inputFocus,
    });
  }
  function showPreferenceWarning(warningOptions) {
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
      notification
        .html(innerText)
        .find('.marklyra-enter-mode-warning-header')
        .attr('data-lg', 'Front')
        .attr('data-localize', warningTitle)
        .attr('data-lt', '')
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
        .end();
      document.body.classList.add('marklyra-show-notification');
      if (focusTarget) {
        notification.focus();
      }
      suppressionKey = preferenceKey;
      if (preferenceKey) {
        if (!suppressionHandlerBound) {
          suppressionHandlerBound = true;
          jquery('#md-notification')
            .on('change', '#marklyra-suppress-mode-warning-input', function () {
              var checked = jquery(this).prop('checked');
              JSBridge.putSetting(suppressionKey, checked);
              JSBridge.execForAll('File.option.' + suppressionKey + '=' + checked + ';');
            })
            .on('click', '#marklyra-suppress-mode-warning-close-btn', function () {
              document.body.classList.remove('marklyra-show-notification');
            });
        }
        if (initialChecked) {
          jquery('#marklyra-suppress-mode-warning-input').prop('checked', true).trigger('change');
        } else {
          jquery('#marklyra-suppress-mode-warning-input').prop('checked', false);
        }
      } else {
        notification.find('label').remove();
        notification.one('click', '#marklyra-suppress-mode-warning-close-btn', function () {
          document.body.classList.remove('marklyra-show-notification');
        });
      }
      return notification;
    }
  }
  var timerId,
    CommonDialog = function () {
      this.$dialog = jquery('#common-dialog');
      this.isShown_ = false;
      this.callback_ = null;
      this.checkBoxState = null;
      this.init();
    };
  CommonDialog.prototype.isShown = function () {
    return this.isShown_;
  };
  CommonDialog.prototype.init = function () {
    var receiver = this;
    this.$dialog
      .on('change', '#common-dialog-checkbox', function () {
        receiver.checkBoxState = jquery(this).prop('checked');
        return false;
      })
      .on('click', '.modal-footer button', function () {
        if (receiver.callback_) {
          receiver.callback_(jquery(this).prevAll('button').length, receiver.checkBoxState);
          if (this.classList.contains('btn-light')) {
            return false;
          }
          receiver.callback_ = null;
        }
      })
      .on('hidden.bs.modal', function () {
        if (receiver.callback_) {
          receiver.callback_(null);
        }
      });
  };
  CommonDialog.prototype.show = function (dialogOptions) {
    if (this.isShown_) {
      this.hide();
    }
    this.callback_ = dialogOptions.callback || function () {};
    this.render_(dialogOptions);
    this.$dialog.modal(dialogOptions);
  };
  CommonDialog.prototype.render_ = function (dialogOptions) {
    var $dialog = this.$dialog;
    $dialog.removeClass('error-dialog');
    $dialog.attr('data-tag', dialogOptions.tag);
    if ('error' == dialogOptions.type) {
      $dialog.addClass('error-dialog');
    }
    if (dialogOptions.title) {
      $dialog.removeClass('marklyra-dialog-no-title');
      $dialog.find('.modal-title').text(dialogOptions.title);
    } else {
      $dialog.addClass('marklyra-dialog-no-title');
    }
    (dialogOptions.html
      ? $dialog.find('#common-dialog-message').html(dialogOptions.html)
      : $dialog.find('#common-dialog-message').text(dialogOptions.message || '')
    ).css('text-align', dialogOptions.leftAlign ? 'left' : '');
    if (dialogOptions.checkbox) {
      $dialog.addClass('marklyra-dialog-show-checkbox');
      $dialog
        .find('#common-dialog-checkbox')
        .prop('checked', dialogOptions.checkbox.state || false);
      $dialog.find('#common-dialog-checkbox-label').text(dialogOptions.checkbox.label);
    } else {
      $dialog.removeClass('marklyra-dialog-show-checkbox');
    }
    (function () {
      dialogOptions.buttons = dialogOptions.buttons || [jquery.localize.getString('Close')];
      dialogOptions.helperButtons = dialogOptions.helperButtons || [];
      var buttonTemplate = jquery(
          '<button type="button" data-dismiss="modal" class="btn"></button>',
        ),
        footer = $dialog.find('.modal-footer').html('');
      if (3 == dialogOptions.buttons.length) {
        $dialog.addClass('marklyra-three-way-buttons');
      } else {
        $dialog.removeClass('marklyra-three-way-buttons');
      }
      dialogOptions.helperButtons.forEach(function (item, unusedParameter2) {
        var element = buttonTemplate.clone();
        element.text(item);
        element.addClass('btn-light');
        element[0].removeAttribute('data-dismiss');
        footer.append(element);
      });
      dialogOptions.buttons.forEach(function (item, itemIndex) {
        var element = buttonTemplate.clone();
        element.text(item);
        if (0 == itemIndex) {
          element.addClass('btn-primary');
        } else {
          element.addClass('btn-default');
        }
        footer.append(element);
      });
    })();
  };
  CommonDialog.prototype.hide = function () {
    this.isShown_ = false;
  };
  var currentTimerId,
    hideNotification = function () {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = null;
      document.body.classList.remove('marklyra-show-notification');
    },
    showNotification = function (message, allowHtml, buttons, onButton, autoHideOptions) {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = null;
      var items = buttons || [];
      if (items && 'string' == typeof items) {
        items = [items];
      }
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
      document.body.classList.add('marklyra-show-notification');
      if (items.length) {
        jquery('.btn-default').one('click', function () {
          hideNotification();
          if (onButton) {
            onButton(this.dataset.index - 0);
          }
        });
      }
      if (autoHideOptions) {
        if (autoHideOptions.checkFocus) {
          if (document.hasFocus()) {
            timerId = setTimeout(hideNotification, autoHideOptions.timeout || 1e4);
          }
        } else {
          timerId = setTimeout(hideNotification, autoHideOptions.timeout || 1e4);
        }
      }
      return notification;
    },
    nextLeafNode = function (domNode) {
      if (!domNode) {
        return domNode;
      }
      var firstLeafNode = function (domNode) {
          if (domNode.childNodes && 0 == domNode.childNodes.length) {
            return domNode;
          } else {
            return firstLeafNode(domNode.childNodes[0]);
          }
        },
        nextSibling = domNode.nextSibling;
      if (null == nextSibling) {
        return nextLeafNode(domNode.parentElement);
      } else {
        return firstLeafNode(nextSibling);
      }
    },
    collectTextNodes = function (container) {
      for (
        var domNode, childNodesLength = container.childNodes.length, items = [], itemIndex = 0;
        itemIndex < childNodesLength;
        itemIndex++
      ) {
        var currentDomNode = container.childNodes[itemIndex];
        if (currentDomNode.tagName) {
          if (domNode) {
            if (
              domNode.tagName != currentDomNode.tagName ||
              currentDomNode.childElementCount ||
              domNode.childElementCount ||
              domNode.getAttribute('class') != currentDomNode.getAttribute('class')
            ) {
              domNode = currentDomNode;
            } else {
              items.push(currentDomNode);
              domNode.textContent = domNode.textContent + currentDomNode.textContent;
            }
          } else {
            domNode = currentDomNode;
          }
        } else {
          domNode = null;
        }
      }
      items.forEach(function (item) {
        container.removeChild(item);
      });
    },
    confirmAction = function (message, onConfirm, onCancel) {
      if (window.reqnode) {
        JSBridge.invoke('dialog.showMessageBox', {
          title: jquery.localize.getString('Confirm'),
          message: message,
          type: 'question',
          defaultId: 0,
          cancelId: 1,
          buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
        }).then(({ response: buttonIndex }) => {
          if (0 == buttonIndex) {
            onConfirm();
          } else {
            if (onCancel) {
              onCancel();
            }
          }
        });
      } else {
        if (window.confirm(message)) {
          onConfirm();
        } else {
          if (onCancel) {
            onCancel();
          }
        }
      }
    },
    zoomControlsUnbound = true,
    showZoomHint = function (zoomFactor) {
      if (zoomControlsUnbound) {
        zoomControlsUnbound = false;
        jquery('#zoom-hint')
          .on('click', '#zoom-hint-in', function () {
            JSBridge.zoom.zoomOut();
          })
          .on('click', '#zoom-hint-out', function () {
            JSBridge.zoom.zoomIn();
          })
          .on('click', '#zoom-hint-reset', function () {
            JSBridge.zoom.resetZoom();
          });
      }
      jquery('#zoom-hint-current').text((100 * zoomFactor + '').replace(/\..+/, '') + '%');
      if (currentTimerId) {
        clearTimeout(currentTimerId);
      }
      jquery('#zoom-hint').show();
      document.body.classList.add('on-zoom');
      currentTimerId = setTimeout(function () {
        currentTimerId = null;
        jquery('#zoom-hint').hide();
        document.body.classList.remove('on-zoom');
      }, 3e3);
    },
    dialog = new CommonDialog(),
    showDialog = dialog.show.bind(dialog);
  moduleExports.dialog = dialog;
  moduleExports.showDialog = showDialog;
  window.showDialog = showDialog;
  moduleExports.showNativeDialog = function (dialogOptions) {
    if (File.isMac) {
      window.bridge.callHandler(
        'window.showDialog',
        {
          message: dialogOptions.message,
          checkbox: dialogOptions.checkbox || '',
          buttons: dialogOptions.buttons || [],
        },
        function (dialogResult) {
          dialogOptions.callback(dialogResult[0], dialogResult[1]);
        },
      );
    } else {
      if (dialogOptions.checkbox) {
        dialogOptions.checkbox = { label: dialogOptions.checkbox };
      }
      dialog.show(dialogOptions);
    }
  };
  moduleExports.showErrorDialog = function (title, message) {
    console.debug('EditHelper.showErrorDialog');
    if (window.reqnode) {
      JSBridge.invoke('dialog.showMessageBox', {
        type: 'error',
        title: jquery.localize.getString('Error'),
        message: jquery.localize.getString(title, 'Panel'),
        detail: jquery.localize.getString(message, 'Panel'),
        buttons: [jquery.localize.getString('OK')],
      });
    } else {
      alert(
        jquery.localize.getString(title, 'Panel') +
          '\n' +
          jquery.localize.getString(message, 'Panel'),
      );
    }
  };
  moduleExports.showWarningDialog = function (message, showSuppressionCheckbox) {
    var checkboxLabel = showSuppressionCheckbox
      ? jquery.localize.getString('Do not show this again', 'Panel')
      : '';
    if (window.reqnode) {
      return JSBridge.invoke('dialog.showMessageBox', {
        type: 'question',
        message: message,
        defaultId: 0,
        cancelId: 1,
        buttons: [jquery.localize.getString('OK'), jquery.localize.getString('Cancel')],
        checkboxLabel: checkboxLabel,
      });
    } else {
      if (File.isMac) {
        return new Promise((resolvePromise) => {
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
        });
      } else {
        return void 0;
      }
    }
  };
  moduleExports.showNotificationWithTitle = function (
    title,
    message,
    buttons,
    onButton,
    autoHideOptions,
  ) {
    if (!(message = message || '').trim) {
      message = message.message || '';
    }
    var detailHtml = message
        ? `<br/><span class='md-notification-detail'>${utilities.escape(message.trim().replace(/\n[\s\S]*/, ''))}</span>`
        : message,
      titleHtml = message
        ? '<strong>' + utilities.escape(title) + '</strong>'
        : utilities.escape(title),
      elements = showNotification(
        titleHtml + detailHtml,
        true,
        buttons,
        onButton,
        autoHideOptions,
      ).find('.md-notification-detail');
    if (elements.length) {
      if (elements[0].scrollWidth > elements[0].offsetWidth || message.trim().indexOf('\n') > -1) {
        elements.after(
          "<a id='md-notification-more-btn' class='btn-xs btn'>{label}</a>".replace(
            '{label}',
            jquery.localize.getString('View More', 'Panel'),
          ),
        );
      }
      jquery('#md-notification-more-btn')
        .off('click')
        .on('click', function () {
          showDialog({
            message: message,
            tag: 'detail',
            helperButtons: [jquery.localize.getString('Copy', 'Menu')],
            callback: function (buttonIndex) {
              if (0 == buttonIndex) {
                File.editor.UserOp.setClipboard(null, null, message, true);
              }
            },
          });
        });
    }
  };
  moduleExports.showNotification = showNotification;
  window.showNotification = showNotification;
  moduleExports.showProcessingNotification = function (message, disableAnimation) {
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
    );
    document.body.classList.add('marklyra-show-notification');
    if (disableAnimation) {
      document.body.classList.add('marklyra-notification-no-animation');
    } else {
      document.body.classList.remove('marklyra-notification-no-animation');
    }
  };
  moduleExports.hideNotification = hideNotification;
  moduleExports.confirm = confirmAction;
  moduleExports.confirmWithPromise = function (message) {
    return new Promise((resolvePromise) => {
      confirmAction(
        message,
        () => {
          resolvePromise(true);
        },
        () => {
          resolvePromise(false);
        },
      );
    });
  };
  moduleExports.showZoomPanel = showZoomHint;
  moduleExports.replaceTag = function (sourceElement, tagName) {
    var outerHTML = sourceElement[0].outerHTML,
      regex = new RegExp('<' + sourceElement[0].tagName, 'i'),
      text = outerHTML.replace(regex, '<' + tagName);
    regex = new RegExp('</' + sourceElement[0].tagName + '>$', 'i');
    text = text.replace(regex, '</' + tagName + '>');
    var replacementElement = jquery(text);
    sourceElement.replaceWith(replacementElement);
    return replacementElement;
  };
  moduleExports.getEditParent = function (unusedParameter1, documentNode) {
    return documentNode.getClosetBlock(true);
  };
  moduleExports.fixPopoverPosition = function (anchorElement, popoverOrSelector, compactSpacing) {
    var currentElements,
      offset = anchorElement.offset(),
      left = jquery(editor.sessionStr).offset().left + 10,
      editorWidth = jquery(editor.sessionStr).width(),
      elements = anchorElement.find('.md-arrow');
    if ((popoverOrSelector = popoverOrSelector || '.code-tooltip.md-hover-tip').jquery) {
      elements = (currentElements = popoverOrSelector).find('.md-arrow');
    } else {
      currentElements = anchorElement.find(popoverOrSelector);
    }
    if (anchorElement.length) {
      currentElements.css('max-width', editorWidth - 60);
      offset.top += anchorElement.height() * (compactSpacing ? 1 : 1.5) + (compactSpacing ? 0 : 4);
      offset.left += (anchorElement.width() - currentElements.width()) / 2;
      if (offset.left + currentElements.width() > window.innerWidth - 10) {
        offset.left = window.innerWidth - 10 - currentElements.width();
      } else {
        if (offset.left < left) {
          offset.left = left;
        }
      }
      currentElements.css('position', 'absolute').offset(offset);
      if (!compactSpacing) {
        elements.offset(function (unusedParameter1, arrowOffset) {
          var bounds = {};
          bounds.left = anchorElement.offset().left + anchorElement.width() / 2;
          bounds.top = arrowOffset.top;
          return bounds;
        });
      }
      return currentElements;
    } else {
      console.sendError('cannot fixPopoverPosition on empty $parent');
      return currentElements.hide();
    }
  };
  moduleExports.resetClick = function (keyboardEvent) {
    var currentEditor = File.editor;
    if (ignoreSyntheticClick) {
      return !(ignoreSyntheticClick = false);
    }
    if (
      keyboardEvent.target &&
      ('CONTENT' == keyboardEvent.target.tagName || 'HTML' == keyboardEvent.target.tagName)
    ) {
      var clientX = keyboardEvent.clientX,
        clientY = keyboardEvent.clientY,
        element = document.querySelector(currentEditor.sessionStr),
        offset = jquery(element).offset();
      if (!offset) {
        return;
      }
      var replayedClick = document.createEvent('MouseEvents'),
        left = offset.left,
        rightEdge = offset.left + element.clientWidth,
        top = offset.top,
        bottomEdge = offset.top + element.clientHeight;
      if ((clientX >= left && clientX <= rightEdge) || (clientY >= top && clientY <= bottomEdge)) {
        return;
      }
      ignoreSyntheticClick = true;
      clientX = clientX < offset.left ? offset.left + 1 : offset.left + element.clientWidth - 1;
      clientY = clientY < offset.top ? offset.top + 1 : offset.top + element.clientHeight - 1;
      keyboardEvent.stopPropagation();
      replayedClick = document.createEvent('MouseEvents');
      if (!(element = document.elementFromPoint(clientX, clientY))) {
        return;
      }
      replayedClick.initMouseEvent(
        'click',
        true,
        true,
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
      );
      element.dispatchEvent(replayedClick);
    }
  };
  moduleExports.getWordCount = function (text) {
    if (0 === text.trim().length) {
      return 0;
    }
    var cjkCharacterCount = 0,
      partsLength = [
        'd',
        text
          .replace(/[\u3040-\uABFF\uD7A4-\uFAFF]/gi, function (unusedParameter1) {
            cjkCharacterCount++;
            return ' ';
          })
          .replace(/(^|\s+)[(\u3000-\u303F)!-\/:-@\[-`{-~]+(\s+|$)/gm, ' '),
        'd',
      ]
        .join(' ')
        .split(/[(\u3000-\u303F)\s!-,\.\\:-@\[-`{-~]+/g).length;
    return cjkCharacterCount + partsLength - 2;
  };
  moduleExports.findAnchorElem = function (anchor, headingsOnly) {
    return findAnchorTarget(anchor, headingsOnly)[0];
  };
  moduleExports.normalizeAnchor = function (anchor, items, reserveWriteAnchor) {
    var [headingElements, duplicateIndex] = findAnchorTarget(anchor, true);
    anchor = headingElements.length
      ? '#' + utilities.titleToAnchor(headingElements[0].innerText)
      : anchor;
    if (0 === duplicateIndex) {
      if (items && items.filter((item) => item == anchor).length > 1) {
        duplicateIndex = 1;
      } else {
        if (reserveWriteAnchor && 'write' == anchor) {
          duplicateIndex = 1;
        }
      }
    } else {
      if (!headingElements) {
        duplicateIndex = void 0;
      }
    }
    return anchor + (duplicateIndex ? '-' + duplicateIndex : '');
  };
  moduleExports.fetchAnchorList = function (anchorMap, allowWriteAnchor) {
    var items = [];
    Array.prototype.slice
      .call(document.querySelectorAll('.md-html-inline a[name], .md-htmlblock-container a[name]'))
      .map(function (element) {
        var explicitAnchor = utilities.decodeFromEscapedPath(
          (element.getAttribute('name') || '').substring(1),
        );
        items.push(explicitAnchor);
      });
    Array.prototype.slice
      .call(document.querySelectorAll('.md-heading[cid]'))
      .map(function (element) {
        var nodeId = element.getAttribute('cid');
        if (!anchorMap[nodeId]) {
          var headingAnchor = utilities.titleToAnchor(element.innerText),
            duplicateCount = (function (anchor) {
              for (var matchCount = 0, itemIndex = 0; itemIndex < items.length; itemIndex++) {
                if (items[itemIndex].toLowerCase() == anchor) {
                  matchCount++;
                }
              }
              return matchCount;
            })(headingAnchor);
          items.push(headingAnchor);
          if (duplicateCount) {
            anchorMap[nodeId] = headingAnchor + '-' + (duplicateCount + 1);
          } else {
            if (
              (function (anchor) {
                return !allowWriteAnchor && 'write' == anchor;
              })(headingAnchor)
            ) {
              headingAnchor += '-1';
            }
            anchorMap[nodeId] = headingAnchor;
          }
        }
      });
    return items;
  };
  moduleExports.keyOnControl = function (keyName, keyboardEvent, respectEditorFocus) {
    var element, localElement, focusedIndex;
    function restoreDialogFocus(respectEditorFocus) {
      var dialogElements = jquery('.modal-dialog:visible');
      if (!dialogElements.length) {
        if (respectEditorFocus) {
          var writingArea = document.querySelector('#write');
          if (
            writingArea == document.activeElement ||
            writingArea.contains(document.activeElement)
          ) {
            return dialogElements;
          }
          dialogElements = jquery('.marklyra-show-notification #md-notification');
        }
        dialogElements = jquery('.marklyra-show-notification #md-notification');
      }
      return dialogElements;
    }
    if ('Tab' == keyName) {
      if ((element = restoreDialogFocus(respectEditorFocus)).length) {
        focusedIndex = (localElement = element.find(
          'button, input:not(#common-dialog-checkbox), .marklyra-dialog-show-checkbox #common-dialog-checkbox',
        )).index(document.activeElement);
        if (localElement.length) {
          if (keyboardEvent.shiftKey) {
            focusedIndex--;
          } else {
            focusedIndex++;
          }
          focusedIndex = focusedIndex >= localElement.length ? 0 : focusedIndex;
          focusedIndex = Math.max(0, focusedIndex);
          localElement.eq(focusedIndex).focus();
          return true;
        } else {
          return void 0;
        }
      }
    } else {
      if ('Esc' == keyName) {
        if ((element = restoreDialogFocus(true)) && element.hasClass('modal-dialog')) {
          if (!(1 == element.find('button').length && 1 == element.find('.btn-primary').length)) {
            element.parent().modal('hide');
          }
        } else {
          if (document.body.classList.contains('marklyra-show-notification')) {
            document.body.classList.remove('marklyra-show-notification');
          }
        }
      } else {
        if ('Enter' == keyName && document.activeElement) {
          if (document.activeElement == document.body || 'DIV' == document.activeElement.tagName) {
            if ((element = restoreDialogFocus()).length) {
              return element.find('button.btn-primary').eq(0).focus().trigger('click').length;
            }
          } else {
            if ('BUTTON' == document.activeElement.tagName) {
              jquery(document.activeElement).focus().trigger('click');
              return true;
            }
          }
        } else {
          if (
            ('Left' == keyName || 'Right' == keyName) &&
            (element = restoreDialogFocus()).length &&
            document.activeElement &&
            'BUTTON' == document.activeElement.tagName &&
            (focusedIndex = (localElement = element.find('button')).index(document.activeElement)) >
              -1
          ) {
            if ('Left' === keyName) {
              focusedIndex--;
            } else {
              focusedIndex++;
            }
            focusedIndex = focusedIndex >= localElement.length ? 0 : focusedIndex;
            focusedIndex = Math.max(0, focusedIndex);
            localElement.eq(focusedIndex).focus();
            return true;
          }
        }
      }
    }
  };
  moduleExports.showTypeWriterModeWarning = function () {
    showModeEnabledHint('noWarnigForTypeWriterMode', 'Typewriter Mode');
  };
  moduleExports.showFocusModeWarning = function () {
    showModeEnabledHint('noWarnigForFocusMode', 'Focus Mode');
  };
  moduleExports.markRange = function (range, className) {
    var startContainer,
      startOffset,
      spanElement = document.createElement('span');
    spanElement.classList.add(className);
    startContainer = range.startContainer;
    startOffset = range.startOffset;
    if (startContainer && startContainer.length === startOffset) {
      range.setStart(nextLeafNode(range.startContainer), 0);
    }
    var endBlock =
      range.endContainer &&
      range.endContainer.parentElement &&
      range.endContainer.parentElement.closest('.md-entity');
    spanElement.appendChild(range.extractContents());
    range.insertNode(spanElement);
    if (!(!endBlock || endBlock.innerText || endBlock.contains(spanElement))) {
      endBlock.remove();
    }
    return spanElement;
  };
  moduleExports.unmarkSpan = function (domNode) {
    var parentElement = domNode.parentElement;
    if (parentElement) {
      for (; domNode.firstChild; ) {
        parentElement.insertBefore(domNode.firstChild, domNode);
      }
      parentElement.removeChild(domNode);
      if (parentElement.getAttribute('md-inline')) {
        collectTextNodes(parentElement);
      }
      parentElement.normalize();
    }
  };
  moduleExports.mergeSameChildren = collectTextNodes;
  moduleExports.showHintOrWarning = showPreferenceWarning;
  if (window._options && window._options.zoomFactor && 1 != _options.zoomFactor) {
    if (window._options.onFirstLaunch) {
      showZoomHint(_options.zoomFactor);
    } else {
      document.body.classList.remove('on-zoom');
    }
  }
}
