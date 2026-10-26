// ui/context-menu.
export default function initializeUiContextMenu(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var currentText = '',
    keyboardShortcuts = requireModule('editing/keyboard-shortcuts'),
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    formatting = requireModule('editing/formatting'),
    userOperations = requireModule('editing/user-operations'),
    mediaActions = requireModule('media/actions'),
    utilities = requireModule('shared/utilities'),
    map =
      ((keyboardShortcuts = requireModule('editing/keyboard-shortcuts')),
      requireModule('editing/undo-manager').SnapFlag,
      keyboardShortcuts.map);
  function hideContextMenu(menuSelector) {
    menuSelector = menuSelector || '.context-menu';
    $(menuSelector).removeClass('show').find('.active').removeClass('active');
    $('.marklyra-tooltip').removeClass('shown');
  }
  function inspectPointerTarget(pointerEvent) {
    hideContextMenu();
    JSBridge.invoke('window.inspectElement', pointerEvent.clientX, pointerEvent.clientY);
  }
  var range,
    trimmedText,
    searchServicesInitialized = false;
  function initializeSearchServices() {
    searchServicesInitialized = true;
    var currentItems = _options.searchService || [
      ['Search with Google', 'https://google.com/search?q=%s'],
    ];
    currentItems.forEach(function (item, itemIndex) {
      var element = $(
        $.parseHTML(
          '<li data-group="search" data-key>\n<a role="menuitem">' +
            utilities.escape($.localize.getString(item[0], 'Menu')) +
            '</a></li>',
        )[0],
      );
      if (0 === itemIndex) {
        $('#search-service-placeholder')
          .after('<li class="divider" data-group="search"></li>')
          .replaceWith(element);
        element.attr('data-key', 'search-default');
        if (currentItems.length > 2) {
          element.after(
            '<li data-key="search-with" data-group="search" class="has-extra-menu">\n<a role="menuitem"><span>' +
              $.localize.getString('Search With…') +
              '</span><i class="fa fa-caret-right"></i></a></li>',
          );
        }
      } else {
        if (1 === itemIndex && 2 == currentItems.length) {
          $("[data-key='search-default']").after(element);
        } else {
          $('#search-menu').append(element);
        }
      }
      element.click(function () {
        var text;
        text = item[1];
        hideContextMenu();
        JSBridge.showInBrowser(text.replace(/%s/, encodeURIComponent(currentText)));
      });
    });
  }
  function setMenuGroupVisible(groupName, visible) {
    var element = $("[data-group='" + groupName + "']");
    if (visible) {
      element.removeClass('hide');
    } else {
      element.addClass('hide');
    }
  }
  function getCurrentSpellchecker() {
    return File.editor && File.editor.spellChecker && File.editor.spellChecker.curSpellchecker;
  }
  function restoreContextWordRange(restoreWordRange, includeTrailingPeriod) {
    if (File.editor.sourceView && File.editor.sourceView.inSourceMode) {
      var codeMirror = File.editor.sourceView.cm,
        cursorPosition = codeMirror.getCursor('from'),
        currentCursorPosition = codeMirror.getCursor('to');
      codeMirror.setSelection(cursorPosition, currentCursorPosition, { scroll: false });
      codeMirror.focus();
    } else {
      if (restoreWordRange) {
        if (includeTrailingPeriod && 3 == range.endContainer.nodeType) {
          var text = range.endContainer.textContent;
          if ('.' == text[range.endOffset] && '.' != text[range.endOffset - 1]) {
            range.setEnd(range.endContainer, range.endOffset + 1);
          }
        }
        File.editor.selection.setRange(range);
      } else {
        if (File.editor.lastCursor) {
          File.editor.undo.exeCommand(File.editor.lastCursor);
        }
      }
    }
  }
  async function loadKeyboardShortcuts() {
    if (File.isNode) {
      var keyBindings = await JSBridge.invoke('setting.getKeyBinding'),
        commandAliases = {
          'Delete Table': 'Delete Block',
          'Paragraph (before)': 'Insert Paragraph Before',
          'Paragraph (after)': 'Insert Paragraph After',
          Table: 'Insert Table',
          Image: 'Insert Image',
        },
        keySymbols = { Backspace: '⌫' },
        formatKeyBinding = function (text) {
          return text
            .trim()
            .split(/\s*\+\s*/g)
            .map(function (item) {
              return utilities.capitalize($.localize.getString(keySymbols[item] || item, 'Menu'));
            })
            .join('+');
        },
        findKeyBinding = function (text, inputText) {
          var keyBinding =
            keyBindings[text] ||
            keyBindings[inputText] ||
            keyBindings[text.replace(/\.\.\.|…/, '')] ||
            keyBindings[inputText.replace(/\.\.\.|…/, '')];
          if (!keyBinding && commandAliases[text]) {
            keyBinding = keyBindings[commandAliases[text]];
          }
          return keyBinding;
        };
      document.querySelectorAll('#context-menu .menu-style-btn').forEach((element) => {
        var label = element.dataset.label,
          attributeValue = $.localize.getString(label, 'Menu'),
          shortcutText = findKeyBinding(label, attributeValue) || element.dataset.keyStr;
        if (shortcutText) {
          element.setAttribute(
            'marklyra-hint',
            `${attributeValue}\t${formatKeyBinding(shortcutText)}`,
          );
        } else {
          element.setAttribute('marklyra-hint', attributeValue);
        }
      });
      document.querySelectorAll('.marklyra-menu-shortcut').forEach((element) => {
        var text = '';
        if (element.classList.contains('marklyra-no-key-mod')) {
          text = element.textContent;
        } else {
          var previousElementSibling = element.previousElementSibling;
          if (previousElementSibling) {
            var localize = previousElementSibling.dataset.localize;
            text =
              findKeyBinding(localize, previousElementSibling.textContent) || element.textContent;
          }
        }
        if (text && text.trim()) {
          element.textContent = formatKeyBinding(text);
        }
      });
    }
  }
  var ContextMenu = function (sessionStr) {
      this.sessionStr = sessionStr;
      $(bindContextMenuEvents.bind(this));
    },
    repositionVisibleMenu = function () {
      if (!!document.querySelector('#user-context-menu.show')) {
        this.showCustom(items, activeCustomOwner);
      } else {
        hideContextMenu();
      }
    },
    bindContextMenuEvents = function () {
      $('content').on('post-wheel', repositionVisibleMenu.bind(this));
      $(window).on('resize', repositionVisibleMenu.bind(this));
      bindTableActions.call(this);
      bindMenuHoverAndKeys.call(this);
      bindImageActions.call(this);
      if (!File.isMac) {
        bindNavigationActions.call(this);
        bindInlineStyleActions.call(this);
        bindIndentAndHeadingActions.call(this);
        bindMathExportActions.call(this);
        if (window.reqnode) {
          setTimeout(bindSpellingActions.bind(this), 1e3);
          setTimeout(loadKeyboardShortcuts, 1e3);
        }
      }
    },
    bindInlineStyleActions = function () {
      $('[data-style]').click(function () {
        hideContextMenu();
        restoreContextWordRange();
        File.editor.refocus();
        File.editor.stylize.toggleStyle(this.getAttribute('data-style'));
      });
    },
    updateTableDeleteActions = function () {
      var element = File.editor.getMarkElem(),
        hasDeleteAction = false;
      if (element.closest('tbody').children().length) {
        $("[data-key='delete_table_row']").removeClass('hide');
        hasDeleteAction = true;
      } else {
        $("[data-key='delete_table_row']").addClass('hide');
      }
      if (element.closest('tr').children().length >= 2) {
        $("[data-key='delete_table_col']").removeClass('hide');
        hasDeleteAction = true;
      } else {
        $("[data-key='delete_table_col']").addClass('hide');
      }
      if (hasDeleteAction) {
        $("[data-key='delete_table_col']").next('.divider').removeClass('hide');
      } else {
        $("[data-key='delete_table_col']").next('.divider').addClass('hide');
      }
    };
  ContextMenu.prototype.updateTableVisibility = updateTableDeleteActions;
  var targetBlockElement,
    contextTarget,
    bindMenuHoverAndKeys = function () {
      $('body')
        .on('mouseenter', '.context-menu [data-key]', function () {
          var element = $(this);
          element.closest('.context-menu').find('.active').removeClass('active');
          element.addClass('active');
        })
        .on('mouseleave', '.context-menu', function (unusedParameter1) {
          $(this).find('.active:not(.has-extra-menu)').removeClass('active');
        });
      $('#context-menu, #user-context-menu').on('mouseenter', '[data-key]', function () {
        var element = $(this);
        if ('block-style' == element.attr('data-key')) {
          positionSubmenu('#block-style-menu', element);
          element.addClass('active');
        } else {
          document.querySelector('#block-style-menu').classList.remove('show');
          document.querySelector("[data-key='block-style']").classList.remove('active');
        }
        if ('insert' == element.attr('data-key')) {
          positionSubmenu('#insert-menu', element);
          element.addClass('active');
        } else {
          document.querySelector('#insert-menu').classList.remove('show');
          document.querySelector("[data-key='insert']").classList.remove('active');
        }
        if ('copy-as' == element.attr('data-key')) {
          positionSubmenu('#edit-menu', element);
          element.addClass('active');
        } else {
          document.querySelector("[data-key='copy-as']").classList.remove('active');
          document.querySelector('#edit-menu').classList.remove('show');
        }
        if ('zoom-img' == element.attr('data-key')) {
          positionSubmenu('#zoom-img-menu', element);
          element.addClass('active');
        } else {
          document.querySelector("[data-key='zoom-img']").classList.remove('active');
          document.querySelector('#zoom-img-menu').classList.remove('show');
        }
        if ('switch-img-syntax' == element.attr('data-key')) {
          positionSubmenu('#switch-img-syntax-menu', element);
          element.addClass('active');
        } else {
          document.querySelector("[data-key='switch-img-syntax']").classList.remove('active');
          document.querySelector('#switch-img-syntax-menu').classList.remove('show');
        }
        if ('search-with' == element.attr('data-key')) {
          positionSubmenu('#search-menu', element);
          element.addClass('active');
        } else {
          document.querySelector('#search-menu').classList.remove('show');
          $("[data-key='search-with']").removeClass('active');
        }
        if ('table' == element.attr('data-key')) {
          updateTableDeleteActions();
          positionSubmenu('#table-menu', element);
          element.addClass('active');
        } else {
          document.querySelector('#table-menu').classList.remove('show');
          document.querySelector("[data-key='table']").classList.remove('active');
        }
      });
    },
    bindIndentAndHeadingActions = function () {
      $('#context-menu')
        .on('click', '[data-indent]', function () {
          var attributeValue = this.getAttribute('data-indent');
          hideContextMenu();
          restoreContextWordRange();
          File.editor.refocus();
          File.editor.stylize.toggleIndent(attributeValue);
        })
        .on('click', '[data-tab]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.refocus();
          if ('left' == this.getAttribute('data-tab')) {
            userOperations.lessIndent(File.editor);
          } else {
            userOperations.moreIndent(File.editor);
          }
        });
      $('#block-style-menu').on('click', '[data-block]', function () {
        var attributeValue = this.getAttribute('data-block');
        hideContextMenu();
        restoreContextWordRange();
        File.editor.refocus();
        File.editor.stylize.changeBlock(attributeValue);
      });
      $('#insert-menu')
        .on('click', '[data-insert]', function () {
          var attributeValue = this.getAttribute('data-insert');
          hideContextMenu();
          restoreContextWordRange();
          File.editor.refocus();
          if (attributeValue === NodeType.table) {
            File.editor.tableEdit.insertTable();
          } else {
            if (attributeValue === NodeType.meta_block) {
              File.editor.stylize.insertMetaBlock();
            } else {
              File.editor.stylize.insertBlock(attributeValue);
            }
          }
        })
        .on('click', '[data-insert-p]', function () {
          var insertBefore = 'before' == this.getAttribute('data-insert-p');
          hideContextMenu();
          File.editor.refocus(targetBlockElement.attr('cid'));
          File.editor.UserOp.insertParagraph(insertBefore, File.editor, targetBlockElement);
        });
    },
    bindMathExportActions = function () {
      $('#edit-menu')
        .on('click', '[data-key="copy_as_mathml"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          if (File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1) {
            File.editor.mathBlock.copyAsMathML(targetBlockElement[0]);
          } else {
            File.editor.mathInline.copyAsMathML();
          }
        })
        .on('click', '[data-key="copy_as_word"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          if (File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1) {
            File.editor.mathBlock.copyAsMathML(targetBlockElement[0], true);
          } else {
            File.editor.mathInline.copyAsMathML(true);
          }
        })
        .on('click', '[data-key="copy_as_math_tex"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          if (File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1) {
            File.editor.mathBlock.copyAsTex(targetBlockElement[0]);
          } else {
            File.editor.mathInline.copyAsTex();
          }
        })
        .on('click', '[data-key="copy_as_math_image"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          if (File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1) {
            File.editor.mathBlock.copyAsImage(targetBlockElement[0]);
          } else {
            File.editor.mathInline.copyAsImage();
          }
        });
      if (!File.isWin) {
        $('#math-menu [menu-for-win]').addClass('hide');
      }
    },
    bindTableActions = function () {
      $('#table-menu')
        .on('click', '[data-key="insert_row_before"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.addRow(true);
        })
        .on('click', '[data-key="insert_row_after"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.addRow(false);
        })
        .on('click', '[data-key="delete_table_row"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.deleteRow(false);
        })
        .on('click', '[data-key="insert_col_before"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.addCol(true);
        })
        .on('click', '[data-key="insert_col_after"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.addCol(false);
        })
        .on('click', '[data-key="delete_table_col"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.deleteCol();
        })
        .on('click', '[data-key="delete_table"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.deleteTable();
        })
        .on('click', '[data-key="copy_table"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.copyTable();
        })
        .on('click', '[data-key="reformat_table"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.reformatTable();
        })
        .on('click', '[data-key="move_row_up"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.moveRowUpOrDown(true);
        })
        .on('click', '[data-key="move_row_down"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.moveRowUpOrDown(false);
        })
        .on('click', '[data-key="move_col_left"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.moveColLeftOrRight(true);
        })
        .on('click', '[data-key="move_col_right"]', function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.tableEdit.moveColLeftOrRight(false);
        });
    },
    bindSpellingActions = function () {
      $('#context-menu')
        .on('click', "[data-key='learn']", function () {
          hideContextMenu();
          restoreContextWordRange();
          getCurrentSpellchecker().add(trimmedText);
        })
        .on('click', "[data-key='unlearn']", function () {
          hideContextMenu();
          restoreContextWordRange();
          getCurrentSpellchecker().remove(trimmedText);
        })
        .on('click', "[data-key='correct']", function (clickEvent) {
          hideContextMenu();
          var correctionText = $(clickEvent.target).text();
          restoreContextWordRange(true, !!/\.$/.exec(correctionText));
          userOperations.pasteHandler(File.editor, correctionText, true);
        });
    },
    bindImageActions = function () {
      $('#zoom-img-menu').on('click', "[data-key='zoom-img-to-factor']", function () {
        hideContextMenu();
        restoreContextWordRange();
        File.editor.imgEdit.zoomAction(null, this.dataset.factor);
      });
      $('#switch-img-syntax-menu').on(
        'click',
        "[data-key='switch-img-syntax-markdown']",
        function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.imgEdit.switchPattern(null, false);
        },
      );
      $('#switch-img-syntax-menu').on('click', "[data-key='switch-img-syntax-html']", function () {
        hideContextMenu();
        restoreContextWordRange();
        File.editor.imgEdit.switchPattern(null, true);
      });
    },
    bindNavigationActions = function () {
      $('#context-menu, #context-menu-for-source')
        .on('click', "[data-key='jumpto']", function () {
          hideContextMenu();
          restoreContextWordRange();
          var currentElement = File.editor.getJQueryElem(window.getSelection().anchorNode),
            element = currentElement.closest('a');
          if (!element.length) {
            element = currentElement.closest('[md-inline]').find('a');
          }
          File.editor.tryOpenLink(element);
        })
        .on('click', "[data-key='copy_link']", function () {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.copyCurrentLink();
        })
        .on('click', "[data-key='dev-tool']", inspectPointerTarget)
        .on('click', "[data-key='edit']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.undo.prepCursorSnap();
          $(contextTarget).closest('.md-rawblock-container').trigger('startedit');
          File.editor.undo.endSnap();
          return false;
        })
        .on('click', "[data-key='cut']", function (unusedParameter1) {
          var element;
          hideContextMenu();
          restoreContextWordRange();
          ClientCommand.cut();
          if (document.activeElement && (element = document.activeElement.closest('.CodeMirror'))) {
            setTimeout(function () {
              element.CodeMirror.replaceSelection('', 'start');
            }, 30);
          }
        })
        .on('click', "[data-key='backspace']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          if (File.editor.selection.getRangy()) {
            File.delete();
          } else {
            File.deleteActive(contextTarget);
          }
        })
        .on('click', "[data-key='copy']", function (unusedParameter1) {
          hideContextMenu();
          if (!targetBlockElement.find('.md-rawblock-container').focus().length) {
            restoreContextWordRange();
          }
          ClientCommand.copy();
        })
        .on('click', "[data-key='delete-block']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          if (targetBlockElement.length) {
            File.editor.refocus(targetBlockElement.attr('cid'));
            File.editor.UserOp.deleteBlock(File.editor);
          }
        })
        .on('click', "[data-key='paste']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          ClientCommand.paste();
        })
        .on('click', "[data-key='copy-emoji']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          var emojiText = $('.md-emoji.md-expand [data-emoji]').attr('data-emoji');
          File.editor.UserOp.setClipboard('', '', emojiText, true);
        })
        .on('click', "[data-key='download-as']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          var diagramElement = targetBlockElement.find(
            '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
          )[0];
          mediaActions.downloadAs(diagramElement || contextTarget.closest('svg, img, video'));
        })
        .on('click', "[data-key='copy-all-code']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          File.editor.fences.copyContent();
        })
        .on('click', "[data-key='format-all-code']", function (unusedParameter1) {
          hideContextMenu();
          File.editor.refocus(targetBlockElement.attr('cid'));
          File.editor.fences.formatContent();
        })
        .on('click', "[data-key='format-selected-code']", function (unusedParameter1) {
          hideContextMenu();
          File.editor.refocus(targetBlockElement.attr('cid'));
          File.editor.fences.formatContent(true);
        });
      $('.context-menu').on('mousedown', function (pointerEvent) {
        if (!$(pointerEvent.target).closest('a').length) {
          return false;
        }
      });
      if (File.isNode) {
        if (File.option.debug) {
          $("[data-group='dev-tool']").removeClass('hide');
        } else {
          $("[data-group='dev-tool']").addClass('hide');
        }
      }
      $('#edit-menu')
        .on('click', "[data-key='copy_as_image']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          var diagramElement = targetBlockElement.find(
            '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
          )[0];
          mediaActions.copyImage(diagramElement || contextTarget.closest('svg, img, video'));
        })
        .on('click', "[data-key='copy_as_markdown']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          ClientCommand.copyAsMarkdown();
        })
        .on('click', "[data-key='copy_as_html_source']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          var diagramElement = targetBlockElement.find(
            '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
          )[0];
          if (diagramElement) {
            mediaActions.copyAsHtml(diagramElement);
          } else {
            ClientCommand.copyAsHTMLSource();
          }
        })
        .on('click', "[data-key='copy_as_simple_html']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          ClientCommand.copyAsSemanticHTML();
        })
        .on('click', "[data-key='paste_as_plain']", function (unusedParameter1) {
          hideContextMenu();
          restoreContextWordRange();
          ClientCommand.pasteAsPlain();
        });
      $("[data-key='play']").click(function (unusedParameter1) {
        hideContextMenu();
        try {
          $(contextTarget).closest('video')[0].play();
        } catch (error) {}
      });
      $("[data-key='pause']").click(function (unusedParameter1) {
        hideContextMenu();
        try {
          $(contextTarget).closest('video')[0].pause();
        } catch (error) {}
      });
    },
    positionPointerMenu = function (element, pointerEvent) {
      element.addClass('show');
      var innerWidth = element.width() + 20,
        innerHeight = element.height() + 48,
        menuLeft =
          pointerEvent.clientX > window.innerWidth - innerWidth
            ? window.innerWidth - innerWidth
            : pointerEvent.clientX,
        menuTop =
          pointerEvent.clientY > window.innerHeight - innerHeight
            ? window.innerHeight - innerHeight
            : pointerEvent.clientY - $('#top-titlebar').height() + 8;
      element.css({ top: menuTop + 'px', left: menuLeft + 'px' });
    };
  ContextMenu.prototype.show = function (event, targetOverride) {
    if (!searchServicesInitialized && window.reqnode) {
      initializeSearchServices.call(this);
    }
    if ((contextTarget = targetOverride || event.target) == document.querySelector('#write')) {
      contextTarget = (window.getSelection() || {}).anchorNode || contextTarget;
    }
    if ((targetBlockElement = $(contextTarget).closest('[cid]')).hasClass('md-rawblock')) {
      File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark($(contextTarget)));
    } else {
      $(File.editor.sessionStr).trigger('cursorChange');
      File.editor.lastCursor = File.editor.selection.buildUndo();
      File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark($(contextTarget)));
    }
    $('.context-menu').removeClass('show').find('.active').removeClass('active');
    if (File.editor.sourceView.inSourceMode) {
      positionPointerMenu($('#context-menu-for-source'), event);
      return false;
    }
    !(function () {
      try {
        var element = File.editor
            .getJQueryElem(window.getSelection().anchorNode)
            .closest('a, .md-link'),
          linkTarget = element.attr('href') || element.attr('data-ref');
        if (element.hasClass('md-link')) {
          var elements = element.find('a');
          linkTarget = elements.attr('href') || elements.attr('data-ref');
        }
        setMenuGroupVisible('hyperlink', linkTarget);
      } catch (error) {
        setMenuGroupVisible('hyperlink', false);
      }
    })();
    var contextFeatures =
      (function (targetElement) {
        var currentEditor = File.editor,
          style = currentEditor.styleBookmark.style,
          blockType = style.block[0],
          element = document.querySelector('#context-menu'),
          showIndent = false,
          showTable = false,
          showMath = false,
          showImage = false,
          showEmoji = false;
        setMenuGroupVisible('inline-style', !style.cannotContainInline);
        $('[data-style]').removeClass('active');
        style.inline.map(function (item) {
          var currentElement = document.querySelector("[data-style='" + item + "']");
          if (currentElement) {
            currentElement.classList.add('active');
          }
          if (DocumentNode.isType(item, NodeType.inline_math)) {
            showMath = true;
          }
          if (DocumentNode.isType(item, NodeType.emoji)) {
            showEmoji = true;
          }
          if (DocumentNode.isType(item, NodeType.image)) {
            showImage = NodeType.image;
          }
          if (DocumentNode.isType(item, NodeType.imgtag)) {
            showImage = NodeType.imgtag;
          }
        });
        let targetElements = $(targetElement),
          inlineType = targetElements.closest('[md-inline]').attr('md-inline');
        if (!showImage && DocumentNode.isType(inlineType, NodeType.imgtag, NodeType.image)) {
          showImage = inlineType;
        }
        let elementLength = targetElements.closest('.CodeMirror').length;
        if (showImage === NodeType.image) {
          $("[data-key='switch-img-syntax-markdown'] > a").addClass('state-on');
          $("[data-key='switch-img-syntax-html'] > a").removeClass('state-on');
        }
        if (showImage === NodeType.imgtag) {
          $("[data-key='switch-img-syntax-markdown'] > a").removeClass('state-on');
          $("[data-key='switch-img-syntax-html'] > a").addClass('state-on');
        }
        style.block.map(function (item) {
          if (DocumentNode.isType(item, NodeType.blockquote, NodeType.list_item, 'ul', 'ol')) {
            showIndent = true;
          }
          if (DocumentNode.isType(item, NodeType.table)) {
            showTable = true;
          }
          if (DocumentNode.isType(item, NodeType.math_block)) {
            showMath = true;
          }
        });
        var blockStyleLabel = $.localize.getString(
          formatting.CONST.StyleToNameMap[blockType],
          'Menu',
        );
        if (DocumentNode.isType(blockType, NodeType.html_block, NodeType.math_block)) {
          $("[data-key='block-style']").addClass('hide');
        } else {
          $("[data-key='block-style']").removeClass('hide');
          $("[data-key='block-style'] span").text(
            blockStyleLabel || $.localize.getString('Paragraph', 'Menu'),
          );
        }
        if (blockType == NodeType.paragraph) {
          var documentNode = currentEditor.getNode(targetBlockElement.attr('cid'));
          if (!(!documentNode || documentNode.get('before') || documentNode.get('after'))) {
            if (documentNode.get('parent')) {
              documentNode = documentNode.get('parent');
            }
          }
          if (documentNode) {
            blockStyleLabel = $.localize.getString(
              formatting.CONST.StyleToNameMap[documentNode.get('type')],
              'Menu',
            );
          }
        }
        if (
          !blockStyleLabel ||
          DocumentNode.isType(blockType, NodeType.paragraph, NodeType.heading) ||
          /header/.exec(blockType)
        ) {
          $("[data-group='delete-block']").addClass('hide');
        } else {
          $("[data-key='delete-block']")
            .children('a')
            .text($.localize.getString('Delete %@', 'Menu').replace('%@', blockStyleLabel || ''))
            .removeClass('hide');
        }
        $('#block-style-menu [data-block]')
          .removeClass('state-on')
          .filter("[data-block='" + blockType + "']")
          .addClass('state-on');
        if (style.block.length > 0 && File.editor.stylize.CONST.NormalBlockMap[blockType]) {
          $('[data-block-auto-disable]').removeClass('disabled');
          $('[data-block-auto-hide]').removeClass('hide');
        } else {
          $('[data-block-auto-disable]').addClass('disabled');
          $('[data-block-auto-hide]').addClass('hide');
        }
        if (!(blockType != NodeType.def_footnote && blockType != NodeType.def_link)) {
          $('#insert-menu [data-block-auto-disable]').addClass('disabled');
          $('#insert-menu [data-block-auto-hide]').addClass('hide');
        }
        if (blockType == NodeType.meta_block) {
          $('[data-insert-p="before"]').parent().addClass('disabled');
        } else {
          $('[data-insert="meta_block"]').removeClass('hide');
        }
        if (
          DocumentNode.isType(
            blockType,
            NodeType.html_block,
            NodeType.math_block,
            NodeType.meta_block,
          )
        ) {
          $("[data-group='block-wrap']").addClass('hide');
        } else {
          $("[data-group='block-wrap']").removeClass('hide');
        }
        if (showIndent) {
          element.querySelector('[data-group="block-tab"]').classList.remove('hide');
        } else {
          element.querySelector('[data-group="block-tab"]').classList.add('hide');
        }
        if (elementLength) {
          $("[data-group='code']").removeClass('hide');
          $("[data-group='inline-style']").addClass('hide');
        } else {
          $("[data-group='code']").addClass('hide');
          $("[data-group='inline-style']").removeClass('hide');
        }
        if (showTable) {
          $('[data-group="table"]').removeClass('hide');
          element.querySelector('[data-key="block-style"]').classList.add('hide');
        } else {
          $('[data-group="table"]').addClass('hide');
          element.querySelector('[data-key="block-style"]').classList.remove('hide');
        }
        if (showEmoji) {
          var emojiText = $('.md-emoji.md-expand [data-emoji]').attr('data-emoji');
          if (emojiText) {
            element.querySelector('[data-key="copy-emoji"] a').textContent = $.localize
              .getString("Copy '%@'", 'Menu')
              .replace('%@', emojiText);
          }
          $("#context-menu [data-group='emoji']").addClass(emojiText ? 'show' : 'hide');
        } else {
          $("#context-menu [data-group='emoji']").addClass('hide');
        }
        $("#context-menu [data-group='image']").addClass('hide');
        if (showImage) {
          (function () {
            var currentElement = $('.md-image.md-expand'),
              text =
                currentElement.find('img').attr('src') || currentElement.attr('data-src') || '',
              imageLoaded = !currentElement.hasClass('md-img-error');
            if (!text) {
              return;
            }
            const match = /^file:\/\//.exec(text);
            ['reveal-img-in-finder', 'delete-img-file', 'select-img-target-move'].forEach(
              (item) => {
                var classList = element.querySelector(`[data-key="${item}"]`).classList;
                if ('reveal-img-in-finder' === item && (File.isTextPack() || File.isTextBundle())) {
                  classList.add('hide');
                } else {
                  if (match) {
                    classList.remove('hide');
                  } else {
                    classList.add('hide');
                  }
                }
              },
            );
            ['reveal-img-in-browser', 'delete-img'].forEach((item) => {
              var classList = element.querySelector(`[data-key="${item}"]`).classList;
              if (match) {
                classList.add('hide');
              } else {
                classList.remove('hide');
              }
            });
            element.querySelector('[data-key="zoom-img"]').classList.remove('hide');
            element.querySelector('[data-key="switch-img-syntax"]').classList.remove('hide');
            if (imageLoaded && !File.isTextBundle() && !File.isTextPack()) {
              element.querySelector('[data-key="copy-img"]').classList.remove('hide');
              element.querySelector('[data-key="upload-img"]').classList.remove('hide');
              var imageStorageFolder = File.editor.imgEdit.getTargetImageStorageFolder();
              if (imageStorageFolder && 'upload' != imageStorageFolder) {
                var searchValue = utilities.escapeURL(imageStorageFolder);
                if (-1 == text.replace(/^file:\/\//, '').indexOf(searchValue)) {
                  var folderLabel = utilities.getFolder(imageStorageFolder);
                  if (folderLabel) {
                    $(element)
                      .find('[data-key="copy-img-to-target"] a')
                      .text($.localize.getString('Copy to %@', 'Menu').replace('%@', folderLabel));
                    element
                      .querySelector('[data-key="copy-img-to-target"]')
                      .classList.remove('hide');
                  }
                }
              }
              element.querySelector('[data-key="select-img-target"]').classList.remove('hide');
              element.querySelector('[data-key="select-img-target-move"]').classList.remove('hide');
              $('.divider[data-group="image"]').removeClass('hide');
            }
          })();
        }
        if (style.textSelected) {
          $(
            "[data-key='copy'], [data-key='cut'], [data-copy-action], [data-key='backspace']",
          ).removeClass('disabled');
        } else {
          $('[data-copy-action]').addClass('disabled');
          if (!File.option.lineWiseCopyCut) {
            $("[data-key='copy'], [data-key='cut']").addClass('disabled');
          }
        }
        var localElement = $(contextTarget).closest('.md-rawblock-container');
        if (localElement.length) {
          $("[data-group='copy-paste']").addClass('hide');
          $("[data-key='copy'], [data-group='edit-block']").removeClass('hide');
          if (localElement.hasClass('md-htmlblock-container')) {
            $("[data-key='copy']").addClass('hide');
          }
        } else {
          $("[data-group='copy-paste']").removeClass('hide');
          $("[data-group='edit-block']").addClass('hide');
        }
        if (
          contextTarget.closest &&
          contextTarget.closest('.md-diagram-panel, .md-math-container, .md-mathjax-preview')
        ) {
          $("[data-group='adv-media']").removeClass('hide');
        } else {
          $("[data-group='adv-media']").addClass('hide');
        }
        if (showMath) {
          $("[data-group='math']").removeClass('hide');
          $("[data-group='adv-media'].divider, [data-copy-action], [data-paste-action]").addClass(
            'hide',
          );
          $("[data-key='copy-as']").removeClass('hide');
        } else {
          $("[data-group='math']").addClass('hide');
          $('[data-copy-action], [data-paste-action]').removeClass('hide');
        }
        if (
          contextTarget.closest &&
          contextTarget.closest(
            'img, svg, video, .md-diagram-panel, .md-math-container, .md-mathjax-preview',
          )
        ) {
          $("[data-key='download-as']")
            .removeClass('hide')
            .find('[data-localize]')
            .text(function () {
              return $.localize
                .getString(this.dataset.localize, 'Menu')
                .replace('%@', $.localize.getString('Image', 'Menu'));
            });
        }
        if (contextTarget.closest && contextTarget.closest('.md-diagram')) {
          $("[data-key='download-as']")
            .find('[data-localize]')
            .text(function () {
              return $.localize
                .getString(this.dataset.localize, 'Menu')
                .replace('%@', $.localize.getString('Diagram', 'Menu'));
            });
        }
        if (showMath) {
          $("[data-key='download-as'] [data-localize]").text(function () {
            return $.localize
              .getString(this.dataset.localize, 'Menu')
              .replace('%@', $.localize.getString('Math', 'Menu'));
          });
        }
        if ($(contextTarget).closest('video').length) {
          $("[data-group='video']").removeClass('hide');
          $("[data-key='download-as'] [data-localize]").text(function () {
            return $.localize
              .getString(this.dataset.localize, 'Menu')
              .replace('%@', $.localize.getString('Video', 'Menu'));
          });
        } else {
          if ($(contextTarget).closest('video').length) {
            $("[data-group='video']").addClass('hide');
          }
        }
        return {
          showIndent: showIndent,
          showTable: showTable,
          showMath: showMath,
          showImage: showImage,
          showEmoji: showEmoji,
        };
      })(contextTarget) || {};
    !(function (disableSearch) {
      if (disableSearch) {
        setMenuGroupVisible('search', false);
      } else {
        currentText = '';
        try {
          var selectionRange = editor.selection.getRangy();
          if (-1 == (currentText = selectionRange.toString()).indexOf('\n')) {
            var selectionMarkup = selectionRange.toHtml();
            if (
              (selectionMarkup = $('<div>' + selectionRange.toHtml() + '</div>')
                .find('.md-meta')
                .remove()
                .end()
                .text()).trim().length
            ) {
              currentText = selectionMarkup;
            }
          }
          setMenuGroupVisible('search', currentText.trim().length > 0);
        } catch (error) {
          setMenuGroupVisible('search', false);
        }
      }
    })(contextFeatures.showImage || contextFeatures.showMath);
    if (window.reqnode) {
      (function (disableSpellcheck) {
        range = null;
        trimmedText = '';
        if (disableSpellcheck) {
          setMenuGroupVisible('spell-check', false);
        } else {
          var spellchecker = getCurrentSpellchecker(),
            contextMenu = $('#context-menu');
          if ((range = File.editor.selection.getRangy())) {
            File.editor.selection.selectWord(false, false, range, true, true);
            trimmedText = range.toString().trim();
          }
          if (';' == trimmedText) {
            trimmedText = '';
          }
          trimmedText = (trimmedText || '').replace(/[’]/g, "'");
          if (spellchecker && trimmedText.length) {
            if (
              (function (selectedWord) {
                let spellcheckLanguage = File.editor.spellChecker.getSpellCheckLang_();
                return (
                  !(
                    File.isWin &&
                    'zh' == spellcheckLanguage &&
                    selectedWord &&
                    selectedWord.match(/\p{Script=Han}/u)
                  ) &&
                  !!spellchecker.isMisspelled(selectedWord) &&
                  (!(selectedWord.indexOf('.') > -1) ||
                    spellchecker.isMisspelled(selectedWord + '.'))
                );
              })(trimmedText)
            ) {
              setMenuGroupVisible('spell-check', true);
              contextMenu.find("[data-key='correct']").remove();
              contextMenu.find("[data-key='unlearn']").addClass('hide');
              var corrections = spellchecker.getCorrectionsForMisspelling(trimmedText.trim());
              if (0 == corrections.length) {
                contextMenu.find('#divider-before-learn').addClass('hide');
              } else {
                corrections = corrections.slice(0, 6);
                contextMenu
                  .find('#divider-before-learn')
                  .removeClass('hide')
                  .before(
                    corrections.reduce(function (correctionItemsHtml, correction) {
                      return (correctionItemsHtml +=
                        '<li data-group="spell-check" data-key="correct"><a role="menuitem">' +
                        correction +
                        '</a></li>');
                    }, ''),
                  );
              }
            } else {
              if (spellchecker.isLearned(trimmedText)) {
                contextMenu.find("[data-key='correct']").remove();
                setMenuGroupVisible('spell-check', true);
                contextMenu.find("[data-key='learn'], #divider-before-learn").addClass('hide');
                contextMenu.find("[data-key='unlearn']").removeClass('hide');
              } else {
                setMenuGroupVisible('spell-check', false);
              }
            }
          } else {
            setMenuGroupVisible('spell-check', false);
          }
        }
      })(contextFeatures.showImage || contextFeatures.showMath);
    }
    positionPointerMenu($('#context-menu'), event);
    event.preventDefault();
    event.stopPropagation();
  };
  ContextMenu.prototype.hide = hideContextMenu;
  var positionSubmenu = function (menuSelector, anchorElement) {
    var anchorWidth = anchorElement.width(),
      submenu = $(menuSelector).addClass('show'),
      submenuWidth = submenu.width(),
      innerHeight = submenu.height() + 48,
      offset = anchorElement.offset(),
      left = offset.left,
      anchorRight = left + anchorWidth,
      preferredTop = offset.top - 30,
      submenuLeft =
        anchorRight + submenuWidth > window.innerWidth
          ? Math.max(0, left - submenuWidth - 6)
          : anchorRight + 6,
      submenuTop =
        preferredTop + innerHeight > window.innerHeight
          ? window.innerHeight - innerHeight
          : preferredTop;
    submenu.css({ top: submenuTop + 'px', left: submenuLeft + 'px' });
    return false;
  };
  ContextMenu.prototype.showExtMenu = positionSubmenu;
  var customFocusElement,
    activeCustomOwner,
    items,
    navigateContextMenu = function (activeElement, navigationKey) {
      var element,
        submenuItemIndex,
        currentElement = $(activeElement);
      if ('Enter' == navigationKey) {
        if (!currentElement.hasClass('has-extra-menu')) {
          var elements = currentElement.find('a');
          if (elements.length) {
            elements.trigger('click');
          } else {
            currentElement.trigger('click');
          }
          return true;
        }
        navigationKey = 'OpenSubmenu';
      }
      if ('Up' == navigationKey || 'Down' == navigationKey) {
        currentElement.trigger('mouseleave');
        currentElement = currentElement.closest('li');
        if (
          0 ==
          (element = 'Up' == navigationKey ? currentElement.prev() : currentElement.next()).length
        ) {
          if (currentElement.closest('#user-context-menu').length) {
            hideContextMenu();
            return true;
          }
          element =
            'Up' == navigationKey
              ? currentElement.parent().children().last()
              : currentElement.parent().children().first();
        }
        if (element.hasClass('hide') || element.hasClass('divider')) {
          return navigateContextMenu(element[0], navigationKey);
        } else {
          currentElement = currentElement.closest('.context-menu').find('.active');
          if (element.hasClass('has-btn-submenu')) {
            submenuItemIndex =
              (currentElement.prevAll('a').length /
                (currentElement.closest('.has-btn-submenu').find('a').length || 1)) *
              element.find('a').length;
            (element = $(element.find('[data-key]')[Math.floor(submenuItemIndex)])).trigger(
              'mouseenter',
            );
            return true;
          } else {
            currentElement.removeClass('active');
            element.addClass('active');
            return true;
          }
        }
      }
      if (
        ('Left' == navigationKey || 'Right' == navigationKey) &&
        'A' == currentElement[0].tagName
      ) {
        currentElement.trigger('mouseleave');
        if (
          !(element = 'Left' == navigationKey ? currentElement.prev() : currentElement.next())
            .length
        ) {
          element =
            'Up' == navigationKey
              ? currentElement.parent().children().last('')
              : currentElement.parent().children().first();
        }
        element.trigger('mouseenter');
        currentElement.removeClass('active');
        element.addClass('active');
        return true;
      }
      if ('Left' == navigationKey || 'Esc' == navigationKey) {
        if (
          (currentElement = currentElement.closest('.context-menu')).hasClass('ext-context-menu')
        ) {
          currentElement.find('.active').removeClass('active');
          currentElement.removeClass('show');
          return true;
        }
        if ('Left' == navigationKey) {
          return true;
        }
      }
      if ('Right' == navigationKey || 'OpenSubmenu' == navigationKey) {
        if (currentElement.hasClass('has-extra-menu')) {
          currentElement.trigger('mouseenter');
          $('.ext-context-menu:visible [data-key]:visible').first().trigger('mouseenter');
        }
        return true;
      } else {
        return void 0;
      }
    };
  ContextMenu.prototype.handleKeyEvent = function (keyboardEvent) {
    var keyName = map[keyboardEvent.keyCode || keyboardEvent.which];
    if (DocumentNode.isType(keyName, 'Esc', 'Right', 'Left', 'Up', 'Down', 'Return', 'Enter')) {
      var activeSubmenuItem,
        visibleMenus = $('.context-menu:visible');
      return (
        !!visibleMenus.length &&
        ('Esc' == keyName
          ? ($('.context-menu').removeClass('show').find('.active').removeClass('active'), true)
          : visibleMenus.find('.active').length
            ? (activeSubmenuItem = $('.ext-context-menu .active')[0])
              ? navigateContextMenu(activeSubmenuItem, keyName)
              : navigateContextMenu($('.context-menu .active')[0], keyName)
            : 'Up' == keyName
              ? (visibleMenus.find('li[data-key]:visible').last().addClass('active'), true)
              : 'Down' == keyName
                ? (visibleMenus.find('li[data-key]:visible').first().addClass('active'), true)
                : void 0)
      );
    }
  };
  ContextMenu.prototype.getCustomFocuedElem = function () {
    if (customFocusElement.length) {
      return customFocusElement;
    } else {
      return null;
    }
  };
  ContextMenu.prototype.hideCustomMenu = function (menuOwner) {
    if (menuOwner == activeCustomOwner && $('#user-context-menu.show').length) {
      this.addClass('hide');
    }
  };
  ContextMenu.prototype.showCustom = function (inputItems, menuOwner) {
    customFocusElement = null;
    if (window.getSelection().rangeCount) {
      activeCustomOwner = menuOwner;
      items = inputItems;
      var element = $('#user-context-menu').html(
        inputItems
          .map(function (item) {
            if (item.key == ContextMenu.SPLITER) {
              return '<li for-file class="divider"></li>';
            } else {
              return (
                '<li data-key="' +
                item.key +
                '"' +
                (item.hasExtraMenu ? ' class="has-extra-menu" ' : '') +
                '><a role="menuitem"' +
                (item.variable ? ' data-variable=' + JSON.stringify(item.variable) : '') +
                '>' +
                $.localize.getString(item.label, 'Menu').replace('%@', item.variable || '') +
                (item.hasExtraMenu ? '<i class="fa fa-caret-right"></i>' : '') +
                '</a></li>'
              );
            }
          })
          .join(''),
      );
      setTimeout(function () {
        var currentRange = window.getSelection().getRangeAt(0),
          selectionRects = currentRange.getClientRects(),
          bounds = selectionRects.length && selectionRects[selectionRects.length - 1];
        if (!bounds || (0 == bounds.left && 0 == bounds.height)) {
          currentRange.selectNodeContents(currentRange.commonAncestorContainer);
          bounds =
            (selectionRects = currentRange.getClientRects()).length &&
            selectionRects[selectionRects.length - 1];
        }
        if (bounds && (0 != bounds.left || 0 != bounds.height)) {
          var blockElement = $(currentRange.commonAncestorContainer).closest('[cid]')[0],
            blockLeft = (blockElement && blockElement.getBoundingClientRect().left) || 0;
          element.addClass('show').css({
            top: bounds.bottom + 'px',
            left: Math.max(blockLeft, bounds.right - element.width() + 20) + 'px',
          });
          customFocusElement = $(currentRange.commonAncestorContainer).closest('[md-inline]');
        }
      }, 100);
    }
  };
  ContextMenu.prototype.getContextTarget = function () {
    return contextTarget;
  };
  ContextMenu.prototype.getMenuItemsForMac = function (inputElement, skipRefocus) {
    contextTarget = inputElement;
    targetBlockElement = $(contextTarget).closest('[cid]');
    if (
      inputElement.closest &&
      !inputElement.closest('body') &&
      inputElement.closest('.CodeMirror-line')
    ) {
      inputElement = document.activeElement.closest('.CodeMirror');
      contextTarget = inputElement;
    }
    if (!inputElement) {
      return [];
    }
    if (
      void (
        inputElement.ownerDocument.defaultView != window &&
        (inputElement = (function findOwningFrameElement(frameWindow) {
          if (frameWindow.parent == window) {
            return frameWindow.frameElement;
          } else {
            if (frameWindow && frameWindow.parent) {
              return findOwningFrameElement(frameWindow.parent);
            } else {
              return null;
            }
          }
        })(inputElement.ownerDocument.defaultView))
      ) ||
      document.querySelector('#write').contains(inputElement)
    ) {
      return (function () {
        var menuItems = [],
          currentItems = ['normal'];
        try {
          var markElement = editor.getMarkElem(inputElement);
          if (
            DocumentNode.isType(document.activeElement.tagName, 'INPUT', 'TEXTAREA') &&
            !markElement.length
          ) {
            return ['input'];
          }
          if (markElement.length && !skipRefocus) {
            if (!markElement.hasClass('md-diagram')) {
              File.editor.refocus(markElement.attr('cid'));
            }
          }
          var currentRange = editor.selection.getRangy(),
            element = $(inputElement).closest('.md-expand'),
            blockType = markElement.attr('mdtype'),
            downloadAction = null;
          if (inputElement.closest('img, svg')) {
            downloadAction = 'download-image';
          }
          if (inputElement.closest('video')) {
            downloadAction = 'download-video';
          }
          if (markElement.attr('tabindex')) {
            menuItems = ['insertParagraphBefore', 'insertParagraphAfter', 'delete'];
          }
          if (/^table/g.exec(blockType) && !File.isLocked) {
            menuItems = ['|', 'table', '|', 'insertParagraphBefore', 'insertParagraphAfter'];
          }
          if (DocumentNode.isType(blockType, NodeType.html_block)) {
            menuItems = [
              '|',
              'edit',
              'code-tools',
              '|',
              'insertParagraphBefore',
              'insertParagraphAfter',
              'delete',
            ];
          }
          if (DocumentNode.isType(blockType, NodeType.math_block)) {
            downloadAction = null;
            menuItems = [
              '|',
              'edit',
              'copyMathBlock',
              'download-math',
              'code-tools',
              '|',
              'insertParagraphBefore',
              'insertParagraphAfter',
              'delete',
            ];
          }
          if (DocumentNode.isType(blockType, NodeType.fences)) {
            if (markElement.hasClass('md-diagram')) {
              downloadAction = null;
              menuItems = [
                '|',
                'edit',
                'copy-as-image',
                'download-diagram',
                'code-tools',
                '|',
                'insertParagraphBefore',
                'insertParagraphAfter',
                'delete',
              ];
            } else {
              menuItems = [
                '|',
                'code-tools',
                '|',
                'insertParagraphBefore',
                'insertParagraphAfter',
                'delete-fences',
              ];
            }
          }
          var targetElements = $(inputElement);
          currentItems.push(downloadAction);
          if (markElement.hasClass('md-def-link')) {
            var currentElement = $(currentRange.commonAncestorContainer).closest('.md-def-url');
            if (currentElement.length) {
              File.editor.setCurLinkElem(currentElement);
              currentItems = ['openLink', 'copyLink', '|', 'normal', downloadAction];
            }
          }
          if (targetElements.closest('a, .md-link').length) {
            File.editor.setCurLinkElem(
              targetElements.closest('a, .md-link').find('a').addBack('a'),
            );
            currentItems = ['openLink', 'copyLink', '|', 'normal', downloadAction];
          }
          if (targetElements.closest('.md-emoji').length) {
            currentItems = [
              'copyEmoji-' +
                targetElements.closest('.md-emoji').find('[data-emoji]').attr('data-emoji'),
              '|',
            ].concat(currentItems);
          }
          if (
            currentRange &&
            $(currentRange.commonAncestorContainer).closest('.md-inline-math').length
          ) {
            currentItems = ['copyMathInline', '|'].concat(currentItems);
          }
          if (
            DocumentNode.isType(
              element.hasClass('md-img-loaded') && element.attr('md-inline'),
              NodeType.refimg,
            ) &&
            /^file:\/\//.exec(element.find('img').attr('src') || '')
          ) {
            currentItems = ['revealInFinder', '|'].concat(currentItems);
          }
          if (
            DocumentNode.isType(
              element.hasClass('md-img-loaded') && element.attr('md-inline'),
              NodeType.image,
              NodeType.imgtag,
            )
          ) {
            currentItems = File.editor.imgEdit
              .contextMenuItems(element.find('img')[0])
              .concat('revealInFinder' == currentItems[0] ? [] : ['|'])
              .concat(currentItems);
          }
        } catch (error) {}
        return currentItems.concat(menuItems).filter((item) => null != item);
      })();
    }
    if (
      File.editor.sourceView.inSourceMode &&
      document.querySelector('#marklyra-source').contains(inputElement)
    ) {
      return ['input'];
    }
    var targetElements = File.editor.getJQueryElem(inputElement),
      localElement = targetElements.closest(
        '.file-library-node, .marklyra-search-item, #file-library-search, #outline-content',
      );
    if (localElement.hasClass('outline-content')) {
      var outline = File.editor.library.outline,
        collapsible = !document.body.classList.contains('no-collapse-outline');
      if (outline.isShown_) {
        return ['highlight', '|', 'filter-on'];
      } else {
        if (collapsible) {
          return [
            'highlight',
            '|',
            'filter-off',
            '|',
            'expand-all',
            'collapse-all',
            '|',
            'collapsible-outline-on',
            'flat-outline-off',
          ];
        } else {
          return [
            'highlight',
            '|',
            'filter-off',
            '|',
            'collapsible-outline-off',
            'flat-outline-on',
          ];
        }
      }
    }
    if (localElement.hasClass('marklyra-search-item')) {
      return ['file-search'];
    }
    if ('file-library-search' == localElement.attr('id')) {
      return ['file-search-empty'];
    }
    if (File.editor.library.useTreeStyle) {
      if (localElement.length) {
        if (localElement.attr('data-path') == File.getMountFolder()) {
          return [`folder-root${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`];
        } else {
          return [
            ('true' == localElement.attr('data-is-directory') ? 'folder' : 'file') +
              (File.editor.library.isReadOnlyRoot() ? '-readonly' : ''),
          ];
        }
      }
      if (File.getMountFolder() && targetElements.closest('#file-library').length) {
        return [`folder-root${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`];
      }
    } else {
      if (localElement.length) {
        return [`file-list${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`];
      }
    }
    return [];
  };
  ContextMenu.prototype.downloadAsAction = function () {
    var diagramElement = targetBlockElement.find(
      '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
    )[0];
    mediaActions.downloadAs(diagramElement || contextTarget.closest('svg, img, video'));
  };
  ContextMenu.prototype.copyAsImageAction = function () {
    var diagramElement = targetBlockElement.find(
      '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
    )[0];
    mediaActions.copyImage(diagramElement || contextTarget.closest('svg, img, video'));
  };
  ContextMenu.prototype.insertParagraphBefore = function () {
    File.editor.UserOp.insertParagraph(true, void 0, targetBlockElement.closest('[cid]'));
  };
  ContextMenu.prototype.insertParagraphAfter = function () {
    File.editor.UserOp.insertParagraph(false, void 0, targetBlockElement.closest('[cid]'));
  };
  ContextMenu.prototype.editActive = function () {
    File.editActive(contextTarget);
  };
  ContextMenu.prototype.deleteActive = function () {
    File.deleteActive(contextTarget);
  };
  ContextMenu.prototype.restoreLastCursor = restoreContextWordRange;
  ContextMenu.SPLITER = 'divider';
  moduleRecord.exports = ContextMenu;
}
