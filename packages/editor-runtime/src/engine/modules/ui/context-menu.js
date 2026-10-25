// ui/context-menu.
// SystemJS module 4c. Dependencies: 27, 13, 2d, 30, 2a, 11, 1b.
$__System.registerDynamic(
  '4c',
  ['27', '13', '2d', '30', '2a', '11', '1b'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var currentText = '',
      keyboardShortcuts = requireModule('27'),
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      formatting = requireModule('2d'),
      userOperations = requireModule('30'),
      mediaActions = requireModule('2a'),
      utilities = requireModule('11'),
      map =
        ((keyboardShortcuts = requireModule('27')),
        requireModule('1b').SnapFlag,
        keyboardShortcuts.map);
    function p(menuSelector) {
      (menuSelector = menuSelector || '.context-menu'),
        $(menuSelector).removeClass('show').find('.active').removeClass('active'),
        $('.marklyra-tooltip').removeClass('shown');
    }
    function f(pointerEvent) {
      p(), JSBridge.invoke('window.inspectElement', pointerEvent.clientX, pointerEvent.clientY);
    }
    var range,
      trimmedText,
      searchServicesInitialized = !1;
    function y() {
      searchServicesInitialized = !0;
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
        0 === itemIndex
          ? ($('#search-service-placeholder')
              .after('<li class="divider" data-group="search"></li>')
              .replaceWith(element),
            element.attr('data-key', 'search-default'),
            currentItems.length > 2 &&
              element.after(
                '<li data-key="search-with" data-group="search" class="has-extra-menu">\n<a role="menuitem"><span>' +
                  $.localize.getString('Search With…') +
                  '</span><i class="fa fa-caret-right"></i></a></li>',
              ))
          : 1 === itemIndex && 2 == currentItems.length
            ? $("[data-key='search-default']").after(element)
            : $('#search-menu').append(element),
          element.click(function () {
            var text;
            (text = item[1]),
              p(),
              JSBridge.showInBrowser(text.replace(/%s/, encodeURIComponent(currentText)));
          });
      });
    }
    function b(groupName, visible) {
      var element = $("[data-group='" + groupName + "']");
      visible ? element.removeClass('hide') : element.addClass('hide');
    }
    function w() {
      return File.editor && File.editor.spellChecker && File.editor.spellChecker.curSpellchecker;
    }
    function x(restoreWordRange, includeTrailingPeriod) {
      if (File.editor.sourceView && File.editor.sourceView.inSourceMode) {
        var codeMirror = File.editor.sourceView.cm,
          cursorPosition = codeMirror.getCursor('from'),
          currentCursorPosition = codeMirror.getCursor('to');
        codeMirror.setSelection(cursorPosition, currentCursorPosition, { scroll: !1 }),
          codeMirror.focus();
      } else if (restoreWordRange) {
        if (includeTrailingPeriod && 3 == range.endContainer.nodeType) {
          var text = range.endContainer.textContent;
          '.' == text[range.endOffset] &&
            '.' != text[range.endOffset - 1] &&
            range.setEnd(range.endContainer, range.endOffset + 1);
        }
        File.editor.selection.setRange(range);
      } else File.editor.lastCursor && File.editor.undo.exeCommand(File.editor.lastCursor);
    }
    async function C() {
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
          i = function (text) {
            return text
              .trim()
              .split(/\s*\+\s*/g)
              .map(function (item) {
                return utilities.capitalize($.localize.getString(keySymbols[item] || item, 'Menu'));
              })
              .join('+');
          },
          r = function (text, inputText) {
            var keyBinding =
              keyBindings[text] ||
              keyBindings[inputText] ||
              keyBindings[text.replace(/\.\.\.|…/, '')] ||
              keyBindings[inputText.replace(/\.\.\.|…/, '')];
            return (
              !keyBinding &&
                commandAliases[text] &&
                (keyBinding = keyBindings[commandAliases[text]]),
              keyBinding
            );
          };
        document.querySelectorAll('#context-menu .menu-style-btn').forEach((element) => {
          var label = element.dataset.label,
            attributeValue = $.localize.getString(label, 'Menu'),
            shortcutText = r(label, attributeValue) || element.dataset.keyStr;
          shortcutText
            ? element.setAttribute('marklyra-hint', `${attributeValue}\t${i(shortcutText)}`)
            : element.setAttribute('marklyra-hint', attributeValue);
        }),
          document.querySelectorAll('.marklyra-menu-shortcut').forEach((element) => {
            var text = '';
            if (element.classList.contains('marklyra-no-key-mod')) text = element.textContent;
            else {
              var previousElementSibling = element.previousElementSibling;
              if (previousElementSibling) {
                var localize = previousElementSibling.dataset.localize;
                text = r(localize, previousElementSibling.textContent) || element.textContent;
              }
            }
            text && text.trim() && (element.textContent = i(text));
          });
      }
    }
    var F = function (sessionStr) {
        (this.sessionStr = sessionStr), $(k.bind(this));
      },
      S = function () {
        !!document.querySelector('#user-context-menu.show')
          ? this.showCustom(items, activeCustomOwner)
          : p();
      },
      k = function () {
        $('content').on('post-wheel', S.bind(this)),
          $(window).on('resize', S.bind(this)),
          D.call(this),
          M.call(this),
          B.call(this),
          File.isMac ||
            (P.call(this),
            E.call(this),
            L.call(this),
            N.call(this),
            window.reqnode && (setTimeout(R.bind(this), 1e3), setTimeout(C, 1e3)));
      },
      E = function () {
        $('[data-style]').click(function () {
          p(),
            x(),
            File.editor.refocus(),
            File.editor.stylize.toggleStyle(this.getAttribute('data-style'));
        });
      },
      T = function () {
        var element = File.editor.getMarkElem(),
          hasDeleteAction = !1;
        element.closest('tbody').children().length
          ? ($("[data-key='delete_table_row']").removeClass('hide'), (hasDeleteAction = !0))
          : $("[data-key='delete_table_row']").addClass('hide'),
          element.closest('tr').children().length >= 2
            ? ($("[data-key='delete_table_col']").removeClass('hide'), (hasDeleteAction = !0))
            : $("[data-key='delete_table_col']").addClass('hide'),
          hasDeleteAction
            ? $("[data-key='delete_table_col']").next('.divider').removeClass('hide')
            : $("[data-key='delete_table_col']").next('.divider').addClass('hide');
      };
    F.prototype.updateTableVisibility = T;
    var targetBlockElement,
      contextTarget,
      M = function () {
        $('body')
          .on('mouseenter', '.context-menu [data-key]', function () {
            var element = $(this);
            element.closest('.context-menu').find('.active').removeClass('active'),
              element.addClass('active');
          })
          .on('mouseleave', '.context-menu', function (unusedParameter1) {
            $(this).find('.active:not(.has-extra-menu)').removeClass('active');
          }),
          $('#context-menu, #user-context-menu').on('mouseenter', '[data-key]', function () {
            var element = $(this);
            'block-style' == element.attr('data-key')
              ? (O('#block-style-menu', element), element.addClass('active'))
              : (document.querySelector('#block-style-menu').classList.remove('show'),
                document.querySelector("[data-key='block-style']").classList.remove('active')),
              'insert' == element.attr('data-key')
                ? (O('#insert-menu', element), element.addClass('active'))
                : (document.querySelector('#insert-menu').classList.remove('show'),
                  document.querySelector("[data-key='insert']").classList.remove('active')),
              'copy-as' == element.attr('data-key')
                ? (O('#edit-menu', element), element.addClass('active'))
                : (document.querySelector("[data-key='copy-as']").classList.remove('active'),
                  document.querySelector('#edit-menu').classList.remove('show')),
              'zoom-img' == element.attr('data-key')
                ? (O('#zoom-img-menu', element), element.addClass('active'))
                : (document.querySelector("[data-key='zoom-img']").classList.remove('active'),
                  document.querySelector('#zoom-img-menu').classList.remove('show')),
              'switch-img-syntax' == element.attr('data-key')
                ? (O('#switch-img-syntax-menu', element), element.addClass('active'))
                : (document
                    .querySelector("[data-key='switch-img-syntax']")
                    .classList.remove('active'),
                  document.querySelector('#switch-img-syntax-menu').classList.remove('show')),
              'search-with' == element.attr('data-key')
                ? (O('#search-menu', element), element.addClass('active'))
                : (document.querySelector('#search-menu').classList.remove('show'),
                  $("[data-key='search-with']").removeClass('active')),
              'table' == element.attr('data-key')
                ? (T(), O('#table-menu', element), element.addClass('active'))
                : (document.querySelector('#table-menu').classList.remove('show'),
                  document.querySelector("[data-key='table']").classList.remove('active'));
          });
      },
      L = function () {
        $('#context-menu')
          .on('click', '[data-indent]', function () {
            var attributeValue = this.getAttribute('data-indent');
            p(), x(), File.editor.refocus(), File.editor.stylize.toggleIndent(attributeValue);
          })
          .on('click', '[data-tab]', function () {
            p(), x(), File.editor.refocus();
            'left' == this.getAttribute('data-tab')
              ? userOperations.lessIndent(File.editor)
              : userOperations.moreIndent(File.editor);
          }),
          $('#block-style-menu').on('click', '[data-block]', function () {
            var attributeValue = this.getAttribute('data-block');
            p(), x(), File.editor.refocus(), File.editor.stylize.changeBlock(attributeValue);
          }),
          $('#insert-menu')
            .on('click', '[data-insert]', function () {
              var attributeValue = this.getAttribute('data-insert');
              p(),
                x(),
                File.editor.refocus(),
                attributeValue === NodeType.table
                  ? File.editor.tableEdit.insertTable()
                  : attributeValue === NodeType.meta_block
                    ? File.editor.stylize.insertMetaBlock()
                    : File.editor.stylize.insertBlock(attributeValue);
            })
            .on('click', '[data-insert-p]', function () {
              var insertBefore = 'before' == this.getAttribute('data-insert-p');
              p(),
                File.editor.refocus(targetBlockElement.attr('cid')),
                File.editor.UserOp.insertParagraph(insertBefore, File.editor, targetBlockElement);
            });
      },
      N = function () {
        $('#edit-menu')
          .on('click', '[data-key="copy_as_mathml"]', function () {
            p(),
              x(),
              File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1
                ? File.editor.mathBlock.copyAsMathML(targetBlockElement[0])
                : File.editor.mathInline.copyAsMathML();
          })
          .on('click', '[data-key="copy_as_word"]', function () {
            p(),
              x(),
              File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1
                ? File.editor.mathBlock.copyAsMathML(targetBlockElement[0], !0)
                : File.editor.mathInline.copyAsMathML(!0);
          })
          .on('click', '[data-key="copy_as_math_tex"]', function () {
            p(),
              x(),
              File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1
                ? File.editor.mathBlock.copyAsTex(targetBlockElement[0])
                : File.editor.mathInline.copyAsTex();
          })
          .on('click', '[data-key="copy_as_math_image"]', function () {
            p(),
              x(),
              File.editor.styleBookmark.style.block.indexOf(NodeType.math_block) > -1
                ? File.editor.mathBlock.copyAsImage(targetBlockElement[0])
                : File.editor.mathInline.copyAsImage();
          }),
          File.isWin || $('#math-menu [menu-for-win]').addClass('hide');
      },
      D = function () {
        $('#table-menu')
          .on('click', '[data-key="insert_row_before"]', function () {
            p(), x(), File.editor.tableEdit.addRow(!0);
          })
          .on('click', '[data-key="insert_row_after"]', function () {
            p(), x(), File.editor.tableEdit.addRow(!1);
          })
          .on('click', '[data-key="delete_table_row"]', function () {
            p(), x(), File.editor.tableEdit.deleteRow(!1);
          })
          .on('click', '[data-key="insert_col_before"]', function () {
            p(), x(), File.editor.tableEdit.addCol(!0);
          })
          .on('click', '[data-key="insert_col_after"]', function () {
            p(), x(), File.editor.tableEdit.addCol(!1);
          })
          .on('click', '[data-key="delete_table_col"]', function () {
            p(), x(), File.editor.tableEdit.deleteCol();
          })
          .on('click', '[data-key="delete_table"]', function () {
            p(), x(), File.editor.tableEdit.deleteTable();
          })
          .on('click', '[data-key="copy_table"]', function () {
            p(), x(), File.editor.tableEdit.copyTable();
          })
          .on('click', '[data-key="reformat_table"]', function () {
            p(), x(), File.editor.tableEdit.reformatTable();
          })
          .on('click', '[data-key="move_row_up"]', function () {
            p(), x(), File.editor.tableEdit.moveRowUpOrDown(!0);
          })
          .on('click', '[data-key="move_row_down"]', function () {
            p(), x(), File.editor.tableEdit.moveRowUpOrDown(!1);
          })
          .on('click', '[data-key="move_col_left"]', function () {
            p(), x(), File.editor.tableEdit.moveColLeftOrRight(!0);
          })
          .on('click', '[data-key="move_col_right"]', function () {
            p(), x(), File.editor.tableEdit.moveColLeftOrRight(!1);
          });
      },
      R = function () {
        $('#context-menu')
          .on('click', "[data-key='learn']", function () {
            p(), x(), w().add(trimmedText);
          })
          .on('click', "[data-key='unlearn']", function () {
            p(), x(), w().remove(trimmedText);
          })
          .on('click', "[data-key='correct']", function (clickEvent) {
            p();
            var correctionText = $(clickEvent.target).text();
            x(!0, !!/\.$/.exec(correctionText)),
              userOperations.pasteHandler(File.editor, correctionText, !0);
          });
      },
      B = function () {
        $('#zoom-img-menu').on('click', "[data-key='zoom-img-to-factor']", function () {
          p(), x(), File.editor.imgEdit.zoomAction(null, this.dataset.factor);
        }),
          $('#switch-img-syntax-menu').on(
            'click',
            "[data-key='switch-img-syntax-markdown']",
            function () {
              p(), x(), File.editor.imgEdit.switchPattern(null, !1);
            },
          ),
          $('#switch-img-syntax-menu').on(
            'click',
            "[data-key='switch-img-syntax-html']",
            function () {
              p(), x(), File.editor.imgEdit.switchPattern(null, !0);
            },
          );
      },
      P = function () {
        $('#context-menu, #context-menu-for-source')
          .on('click', "[data-key='jumpto']", function () {
            p(), x();
            var currentElement = File.editor.getJQueryElem(window.getSelection().anchorNode),
              element = currentElement.closest('a');
            element.length || (element = currentElement.closest('[md-inline]').find('a')),
              File.editor.tryOpenLink(element);
          })
          .on('click', "[data-key='copy_link']", function () {
            p(), x(), File.editor.copyCurrentLink();
          })
          .on('click', "[data-key='dev-tool']", f)
          .on('click', "[data-key='edit']", function (unusedParameter1) {
            return (
              p(),
              x(),
              File.editor.undo.prepCursorSnap(),
              $(contextTarget).closest('.md-rawblock-container').trigger('startedit'),
              File.editor.undo.endSnap(),
              !1
            );
          })
          .on('click', "[data-key='cut']", function (unusedParameter1) {
            var element;
            p(),
              x(),
              ClientCommand.cut(),
              document.activeElement &&
                (element = document.activeElement.closest('.CodeMirror')) &&
                setTimeout(function () {
                  element.CodeMirror.replaceSelection('', 'start');
                }, 30);
          })
          .on('click', "[data-key='backspace']", function (unusedParameter1) {
            p(),
              x(),
              File.editor.selection.getRangy() ? File.delete() : File.deleteActive(contextTarget);
          })
          .on('click', "[data-key='copy']", function (unusedParameter1) {
            p(),
              targetBlockElement.find('.md-rawblock-container').focus().length || x(),
              ClientCommand.copy();
          })
          .on('click', "[data-key='delete-block']", function (unusedParameter1) {
            p(),
              x(),
              targetBlockElement.length &&
                (File.editor.refocus(targetBlockElement.attr('cid')),
                File.editor.UserOp.deleteBlock(File.editor));
          })
          .on('click', "[data-key='paste']", function (unusedParameter1) {
            p(), x(), ClientCommand.paste();
          })
          .on('click', "[data-key='copy-emoji']", function (unusedParameter1) {
            p(), x();
            var emojiText = $('.md-emoji.md-expand [data-emoji]').attr('data-emoji');
            File.editor.UserOp.setClipboard('', '', emojiText, !0);
          })
          .on('click', "[data-key='download-as']", function (unusedParameter1) {
            p(), x();
            var diagramElement = targetBlockElement.find(
              '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
            )[0];
            mediaActions.downloadAs(diagramElement || contextTarget.closest('svg, img, video'));
          })
          .on('click', "[data-key='copy-all-code']", function (unusedParameter1) {
            p(), x(), File.editor.fences.copyContent();
          })
          .on('click', "[data-key='format-all-code']", function (unusedParameter1) {
            p(),
              File.editor.refocus(targetBlockElement.attr('cid')),
              File.editor.fences.formatContent();
          })
          .on('click', "[data-key='format-selected-code']", function (unusedParameter1) {
            p(),
              File.editor.refocus(targetBlockElement.attr('cid')),
              File.editor.fences.formatContent(!0);
          }),
          $('.context-menu').on('mousedown', function (pointerEvent) {
            if (!$(pointerEvent.target).closest('a').length) return !1;
          }),
          File.isNode &&
            (File.option.debug
              ? $("[data-group='dev-tool']").removeClass('hide')
              : $("[data-group='dev-tool']").addClass('hide')),
          $('#edit-menu')
            .on('click', "[data-key='copy_as_image']", function (unusedParameter1) {
              p(), x();
              var diagramElement = targetBlockElement.find(
                '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
              )[0];
              mediaActions.copyImage(diagramElement || contextTarget.closest('svg, img, video'));
            })
            .on('click', "[data-key='copy_as_markdown']", function (unusedParameter1) {
              p(), x(), ClientCommand.copyAsMarkdown();
            })
            .on('click', "[data-key='copy_as_html_source']", function (unusedParameter1) {
              p(), x();
              var diagramElement = targetBlockElement.find(
                '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
              )[0];
              diagramElement
                ? mediaActions.copyAsHtml(diagramElement)
                : ClientCommand.copyAsHTMLSource();
            })
            .on('click', "[data-key='copy_as_simple_html']", function (unusedParameter1) {
              p(), x(), ClientCommand.copyAsSemanticHTML();
            })
            .on('click', "[data-key='paste_as_plain']", function (unusedParameter1) {
              p(), x(), ClientCommand.pasteAsPlain();
            }),
          $("[data-key='play']").click(function (unusedParameter1) {
            p();
            try {
              $(contextTarget).closest('video')[0].play();
            } catch (error) {}
          }),
          $("[data-key='pause']").click(function (unusedParameter1) {
            p();
            try {
              $(contextTarget).closest('video')[0].pause();
            } catch (error) {}
          });
      },
      I = function (element, pointerEvent) {
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
    (F.prototype.show = function (event, targetOverride) {
      if (
        (!searchServicesInitialized && window.reqnode && y.call(this),
        (contextTarget = targetOverride || event.target) == document.querySelector('#write') &&
          (contextTarget = (window.getSelection() || {}).anchorNode || contextTarget),
        (targetBlockElement = $(contextTarget).closest('[cid]')).hasClass('md-rawblock')
          ? File.editor.stylize.putBookmark(
              null,
              File.editor.stylize.buildBookmark($(contextTarget)),
            )
          : ($(File.editor.sessionStr).trigger('cursorChange'),
            (File.editor.lastCursor = File.editor.selection.buildUndo()),
            File.editor.stylize.putBookmark(
              null,
              File.editor.stylize.buildBookmark($(contextTarget)),
            )),
        $('.context-menu').removeClass('show').find('.active').removeClass('active'),
        File.editor.sourceView.inSourceMode)
      )
        return I($('#context-menu-for-source'), event), !1;
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
          b('hyperlink', linkTarget);
        } catch (error) {
          b('hyperlink', !1);
        }
      })();
      var contextFeatures =
        (function (targetElement) {
          var currentEditor = File.editor,
            style = currentEditor.styleBookmark.style,
            blockType = style.block[0],
            element = document.querySelector('#context-menu'),
            showIndent = !1,
            showTable = !1,
            showMath = !1,
            showImage = !1,
            showEmoji = !1;
          b('inline-style', !style.cannotContainInline),
            $('[data-style]').removeClass('active'),
            style.inline.map(function (item) {
              var currentElement = document.querySelector("[data-style='" + item + "']");
              currentElement && currentElement.classList.add('active'),
                DocumentNode.isType(item, NodeType.inline_math) && (showMath = !0),
                DocumentNode.isType(item, NodeType.emoji) && (showEmoji = !0),
                DocumentNode.isType(item, NodeType.image) && (showImage = NodeType.image),
                DocumentNode.isType(item, NodeType.imgtag) && (showImage = NodeType.imgtag);
            });
          let targetElements = $(targetElement),
            inlineType = targetElements.closest('[md-inline]').attr('md-inline');
          !showImage &&
            DocumentNode.isType(inlineType, NodeType.imgtag, NodeType.image) &&
            (showImage = inlineType);
          let elementLength = targetElements.closest('.CodeMirror').length;
          showImage === NodeType.image &&
            ($("[data-key='switch-img-syntax-markdown'] > a").addClass('state-on'),
            $("[data-key='switch-img-syntax-html'] > a").removeClass('state-on')),
            showImage === NodeType.imgtag &&
              ($("[data-key='switch-img-syntax-markdown'] > a").removeClass('state-on'),
              $("[data-key='switch-img-syntax-html'] > a").addClass('state-on')),
            style.block.map(function (item) {
              DocumentNode.isType(item, NodeType.blockquote, NodeType.list_item, 'ul', 'ol') &&
                (showIndent = !0),
                DocumentNode.isType(item, NodeType.table) && (showTable = !0),
                DocumentNode.isType(item, NodeType.math_block) && (showMath = !0);
            });
          var blockStyleLabel = $.localize.getString(
            formatting.CONST.StyleToNameMap[blockType],
            'Menu',
          );
          if (
            (DocumentNode.isType(blockType, NodeType.html_block, NodeType.math_block)
              ? $("[data-key='block-style']").addClass('hide')
              : ($("[data-key='block-style']").removeClass('hide'),
                $("[data-key='block-style'] span").text(
                  blockStyleLabel || $.localize.getString('Paragraph', 'Menu'),
                )),
            blockType == NodeType.paragraph)
          ) {
            var documentNode = currentEditor.getNode(targetBlockElement.attr('cid'));
            !documentNode ||
              documentNode.get('before') ||
              documentNode.get('after') ||
              (documentNode.get('parent') && (documentNode = documentNode.get('parent'))),
              documentNode &&
                (blockStyleLabel = $.localize.getString(
                  formatting.CONST.StyleToNameMap[documentNode.get('type')],
                  'Menu',
                ));
          }
          if (
            (!blockStyleLabel ||
            DocumentNode.isType(blockType, NodeType.paragraph, NodeType.heading) ||
            /header/.exec(blockType)
              ? $("[data-group='delete-block']").addClass('hide')
              : $("[data-key='delete-block']")
                  .children('a')
                  .text(
                    $.localize.getString('Delete %@', 'Menu').replace('%@', blockStyleLabel || ''),
                  )
                  .removeClass('hide'),
            $('#block-style-menu [data-block]')
              .removeClass('state-on')
              .filter("[data-block='" + blockType + "']")
              .addClass('state-on'),
            style.block.length > 0 && File.editor.stylize.CONST.NormalBlockMap[blockType]
              ? ($('[data-block-auto-disable]').removeClass('disabled'),
                $('[data-block-auto-hide]').removeClass('hide'))
              : ($('[data-block-auto-disable]').addClass('disabled'),
                $('[data-block-auto-hide]').addClass('hide')),
            (blockType != NodeType.def_footnote && blockType != NodeType.def_link) ||
              ($('#insert-menu [data-block-auto-disable]').addClass('disabled'),
              $('#insert-menu [data-block-auto-hide]').addClass('hide')),
            blockType == NodeType.meta_block
              ? $('[data-insert-p="before"]').parent().addClass('disabled')
              : $('[data-insert="meta_block"]').removeClass('hide'),
            DocumentNode.isType(
              blockType,
              NodeType.html_block,
              NodeType.math_block,
              NodeType.meta_block,
            )
              ? $("[data-group='block-wrap']").addClass('hide')
              : $("[data-group='block-wrap']").removeClass('hide'),
            showIndent
              ? element.querySelector('[data-group="block-tab"]').classList.remove('hide')
              : element.querySelector('[data-group="block-tab"]').classList.add('hide'),
            elementLength
              ? ($("[data-group='code']").removeClass('hide'),
                $("[data-group='inline-style']").addClass('hide'))
              : ($("[data-group='code']").addClass('hide'),
                $("[data-group='inline-style']").removeClass('hide')),
            showTable
              ? ($('[data-group="table"]').removeClass('hide'),
                element.querySelector('[data-key="block-style"]').classList.add('hide'))
              : ($('[data-group="table"]').addClass('hide'),
                element.querySelector('[data-key="block-style"]').classList.remove('hide')),
            showEmoji)
          ) {
            var emojiText = $('.md-emoji.md-expand [data-emoji]').attr('data-emoji');
            emojiText &&
              (element.querySelector('[data-key="copy-emoji"] a').textContent = $.localize
                .getString("Copy '%@'", 'Menu')
                .replace('%@', emojiText)),
              $("#context-menu [data-group='emoji']").addClass(emojiText ? 'show' : 'hide');
          } else $("#context-menu [data-group='emoji']").addClass('hide');
          $("#context-menu [data-group='image']").addClass('hide'),
            showImage &&
              (function () {
                var currentElement = $('.md-image.md-expand'),
                  text =
                    currentElement.find('img').attr('src') || currentElement.attr('data-src') || '',
                  imageLoaded = !currentElement.hasClass('md-img-error');
                if (!text) return;
                const match = /^file:\/\//.exec(text);
                if (
                  (['reveal-img-in-finder', 'delete-img-file', 'select-img-target-move'].forEach(
                    (item) => {
                      var classList = element.querySelector(`[data-key="${item}"]`).classList;
                      'reveal-img-in-finder' === item && (File.isTextPack() || File.isTextBundle())
                        ? classList.add('hide')
                        : match
                          ? classList.remove('hide')
                          : classList.add('hide');
                    },
                  ),
                  ['reveal-img-in-browser', 'delete-img'].forEach((item) => {
                    var classList = element.querySelector(`[data-key="${item}"]`).classList;
                    match ? classList.add('hide') : classList.remove('hide');
                  }),
                  element.querySelector('[data-key="zoom-img"]').classList.remove('hide'),
                  element.querySelector('[data-key="switch-img-syntax"]').classList.remove('hide'),
                  imageLoaded && !File.isTextBundle() && !File.isTextPack())
                ) {
                  element.querySelector('[data-key="copy-img"]').classList.remove('hide'),
                    element.querySelector('[data-key="upload-img"]').classList.remove('hide');
                  var imageStorageFolder = File.editor.imgEdit.getTargetImageStorageFolder();
                  if (imageStorageFolder && 'upload' != imageStorageFolder) {
                    var searchValue = utilities.escapeURL(imageStorageFolder);
                    if (-1 == text.replace(/^file:\/\//, '').indexOf(searchValue)) {
                      var folderLabel = utilities.getFolder(imageStorageFolder);
                      folderLabel &&
                        ($(element)
                          .find('[data-key="copy-img-to-target"] a')
                          .text(
                            $.localize.getString('Copy to %@', 'Menu').replace('%@', folderLabel),
                          ),
                        element
                          .querySelector('[data-key="copy-img-to-target"]')
                          .classList.remove('hide'));
                    }
                  }
                  element.querySelector('[data-key="select-img-target"]').classList.remove('hide'),
                    element
                      .querySelector('[data-key="select-img-target-move"]')
                      .classList.remove('hide'),
                    $('.divider[data-group="image"]').removeClass('hide');
                }
              })(),
            style.textSelected
              ? $(
                  "[data-key='copy'], [data-key='cut'], [data-copy-action], [data-key='backspace']",
                ).removeClass('disabled')
              : ($('[data-copy-action]').addClass('disabled'),
                File.option.lineWiseCopyCut ||
                  $("[data-key='copy'], [data-key='cut']").addClass('disabled'));
          var localElement = $(contextTarget).closest('.md-rawblock-container');
          return (
            localElement.length
              ? ($("[data-group='copy-paste']").addClass('hide'),
                $("[data-key='copy'], [data-group='edit-block']").removeClass('hide'),
                localElement.hasClass('md-htmlblock-container') &&
                  $("[data-key='copy']").addClass('hide'))
              : ($("[data-group='copy-paste']").removeClass('hide'),
                $("[data-group='edit-block']").addClass('hide')),
            contextTarget.closest &&
            contextTarget.closest('.md-diagram-panel, .md-math-container, .md-mathjax-preview')
              ? $("[data-group='adv-media']").removeClass('hide')
              : $("[data-group='adv-media']").addClass('hide'),
            showMath
              ? ($("[data-group='math']").removeClass('hide'),
                $(
                  "[data-group='adv-media'].divider, [data-copy-action], [data-paste-action]",
                ).addClass('hide'),
                $("[data-key='copy-as']").removeClass('hide'))
              : ($("[data-group='math']").addClass('hide'),
                $('[data-copy-action], [data-paste-action]').removeClass('hide')),
            contextTarget.closest &&
              contextTarget.closest(
                'img, svg, video, .md-diagram-panel, .md-math-container, .md-mathjax-preview',
              ) &&
              $("[data-key='download-as']")
                .removeClass('hide')
                .find('[data-localize]')
                .text(function () {
                  return $.localize
                    .getString(this.dataset.localize, 'Menu')
                    .replace('%@', $.localize.getString('Image', 'Menu'));
                }),
            contextTarget.closest &&
              contextTarget.closest('.md-diagram') &&
              $("[data-key='download-as']")
                .find('[data-localize]')
                .text(function () {
                  return $.localize
                    .getString(this.dataset.localize, 'Menu')
                    .replace('%@', $.localize.getString('Diagram', 'Menu'));
                }),
            showMath &&
              $("[data-key='download-as'] [data-localize]").text(function () {
                return $.localize
                  .getString(this.dataset.localize, 'Menu')
                  .replace('%@', $.localize.getString('Math', 'Menu'));
              }),
            $(contextTarget).closest('video').length
              ? ($("[data-group='video']").removeClass('hide'),
                $("[data-key='download-as'] [data-localize]").text(function () {
                  return $.localize
                    .getString(this.dataset.localize, 'Menu')
                    .replace('%@', $.localize.getString('Video', 'Menu'));
                }))
              : $(contextTarget).closest('video').length &&
                $("[data-group='video']").addClass('hide'),
            {
              showIndent: showIndent,
              showTable: showTable,
              showMath: showMath,
              showImage: showImage,
              showEmoji: showEmoji,
            }
          );
        })(contextTarget) || {};
      !(function (disableSearch) {
        if (disableSearch) b('search', !1);
        else {
          currentText = '';
          try {
            var selectionRange = editor.selection.getRangy();
            if (-1 == (currentText = selectionRange.toString()).indexOf('\n')) {
              var selectionMarkup = selectionRange.toHtml();
              (selectionMarkup = $('<div>' + selectionRange.toHtml() + '</div>')
                .find('.md-meta')
                .remove()
                .end()
                .text()).trim().length && (currentText = selectionMarkup);
            }
            b('search', currentText.trim().length > 0);
          } catch (error) {
            b('search', !1);
          }
        }
      })(contextFeatures.showImage || contextFeatures.showMath),
        window.reqnode &&
          (function (disableSpellcheck) {
            if (((range = null), (trimmedText = ''), disableSpellcheck)) b('spell-check', !1);
            else {
              var spellchecker = w(),
                contextMenu = $('#context-menu');
              if (
                ((range = File.editor.selection.getRangy()) &&
                  (File.editor.selection.selectWord(!1, !1, range, !0, !0),
                  (trimmedText = range.toString().trim())),
                ';' == trimmedText && (trimmedText = ''),
                (trimmedText = (trimmedText || '').replace(/[’]/g, "'")),
                spellchecker && trimmedText.length)
              )
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
                  b('spell-check', !0),
                    contextMenu.find("[data-key='correct']").remove(),
                    contextMenu.find("[data-key='unlearn']").addClass('hide');
                  var corrections = spellchecker.getCorrectionsForMisspelling(trimmedText.trim());
                  0 == corrections.length
                    ? contextMenu.find('#divider-before-learn').addClass('hide')
                    : ((corrections = corrections.slice(0, 6)),
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
                        ));
                } else
                  spellchecker.isLearned(trimmedText)
                    ? (contextMenu.find("[data-key='correct']").remove(),
                      b('spell-check', !0),
                      contextMenu
                        .find("[data-key='learn'], #divider-before-learn")
                        .addClass('hide'),
                      contextMenu.find("[data-key='unlearn']").removeClass('hide'))
                    : b('spell-check', !1);
              else b('spell-check', !1);
            }
          })(contextFeatures.showImage || contextFeatures.showMath),
        I($('#context-menu'), event),
        event.preventDefault(),
        event.stopPropagation();
    }),
      (F.prototype.hide = p);
    var O = function (menuSelector, anchorElement) {
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
      return submenu.css({ top: submenuTop + 'px', left: submenuLeft + 'px' }), !1;
    };
    F.prototype.showExtMenu = O;
    var customFocusElement,
      activeCustomOwner,
      items,
      q = function (activeElement, navigationKey) {
        var element,
          submenuItemIndex,
          currentElement = $(activeElement);
        if ('Enter' == navigationKey) {
          if (!currentElement.hasClass('has-extra-menu')) {
            var elements = currentElement.find('a');
            return (
              elements.length ? elements.trigger('click') : currentElement.trigger('click'), !0
            );
          }
          navigationKey = 'OpenSubmenu';
        }
        if ('Up' == navigationKey || 'Down' == navigationKey) {
          if (
            (currentElement.trigger('mouseleave'),
            (currentElement = currentElement.closest('li')),
            0 ==
              (element = 'Up' == navigationKey ? currentElement.prev() : currentElement.next())
                .length)
          ) {
            if (currentElement.closest('#user-context-menu').length) return p(), !0;
            element =
              'Up' == navigationKey
                ? currentElement.parent().children().last()
                : currentElement.parent().children().first();
          }
          return element.hasClass('hide') || element.hasClass('divider')
            ? q(element[0], navigationKey)
            : ((currentElement = currentElement.closest('.context-menu').find('.active')),
              element.hasClass('has-btn-submenu')
                ? ((submenuItemIndex =
                    (currentElement.prevAll('a').length /
                      (currentElement.closest('.has-btn-submenu').find('a').length || 1)) *
                    element.find('a').length),
                  (element = $(element.find('[data-key]')[Math.floor(submenuItemIndex)])).trigger(
                    'mouseenter',
                  ),
                  !0)
                : (currentElement.removeClass('active'), element.addClass('active'), !0));
        }
        if (
          ('Left' == navigationKey || 'Right' == navigationKey) &&
          'A' == currentElement[0].tagName
        )
          return (
            currentElement.trigger('mouseleave'),
            (element = 'Left' == navigationKey ? currentElement.prev() : currentElement.next())
              .length ||
              (element =
                'Up' == navigationKey
                  ? currentElement.parent().children().last('')
                  : currentElement.parent().children().first()),
            element.trigger('mouseenter'),
            currentElement.removeClass('active'),
            element.addClass('active'),
            !0
          );
        if ('Left' == navigationKey || 'Esc' == navigationKey) {
          if (
            (currentElement = currentElement.closest('.context-menu')).hasClass('ext-context-menu')
          )
            return (
              currentElement.find('.active').removeClass('active'),
              currentElement.removeClass('show'),
              !0
            );
          if ('Left' == navigationKey) return !0;
        }
        return 'Right' == navigationKey || 'OpenSubmenu' == navigationKey
          ? (currentElement.hasClass('has-extra-menu') &&
              (currentElement.trigger('mouseenter'),
              $('.ext-context-menu:visible [data-key]:visible').first().trigger('mouseenter')),
            !0)
          : void 0;
      };
    (F.prototype.handleKeyEvent = function (keyboardEvent) {
      var keyName = map[keyboardEvent.keyCode || keyboardEvent.which];
      if (DocumentNode.isType(keyName, 'Esc', 'Right', 'Left', 'Up', 'Down', 'Return', 'Enter')) {
        var activeSubmenuItem,
          visibleMenus = $('.context-menu:visible');
        return (
          !!visibleMenus.length &&
          ('Esc' == keyName
            ? ($('.context-menu').removeClass('show').find('.active').removeClass('active'), !0)
            : visibleMenus.find('.active').length
              ? (activeSubmenuItem = $('.ext-context-menu .active')[0])
                ? q(activeSubmenuItem, keyName)
                : q($('.context-menu .active')[0], keyName)
              : 'Up' == keyName
                ? (visibleMenus.find('li[data-key]:visible').last().addClass('active'), !0)
                : 'Down' == keyName
                  ? (visibleMenus.find('li[data-key]:visible').first().addClass('active'), !0)
                  : void 0)
        );
      }
    }),
      (F.prototype.getCustomFocuedElem = function () {
        return customFocusElement.length ? customFocusElement : null;
      }),
      (F.prototype.hideCustomMenu = function (menuOwner) {
        menuOwner == activeCustomOwner &&
          $('#user-context-menu.show').length &&
          this.addClass('hide');
      }),
      (F.prototype.showCustom = function (inputItems, menuOwner) {
        if (((customFocusElement = null), window.getSelection().rangeCount)) {
          (activeCustomOwner = menuOwner), (items = inputItems);
          var element = $('#user-context-menu').html(
            inputItems
              .map(function (item) {
                return item.key == F.SPLITER
                  ? '<li for-file class="divider"></li>'
                  : '<li data-key="' +
                      item.key +
                      '"' +
                      (item.hasExtraMenu ? ' class="has-extra-menu" ' : '') +
                      '><a role="menuitem"' +
                      (item.variable ? ' data-variable=' + JSON.stringify(item.variable) : '') +
                      '>' +
                      $.localize.getString(item.label, 'Menu').replace('%@', item.variable || '') +
                      (item.hasExtraMenu ? '<i class="fa fa-caret-right"></i>' : '') +
                      '</a></li>';
              })
              .join(''),
          );
          setTimeout(function () {
            var currentRange = window.getSelection().getRangeAt(0),
              selectionRects = currentRange.getClientRects(),
              bounds = selectionRects.length && selectionRects[selectionRects.length - 1];
            if (
              ((!bounds || (0 == bounds.left && 0 == bounds.height)) &&
                (currentRange.selectNodeContents(currentRange.commonAncestorContainer),
                (bounds =
                  (selectionRects = currentRange.getClientRects()).length &&
                  selectionRects[selectionRects.length - 1])),
              bounds && (0 != bounds.left || 0 != bounds.height))
            ) {
              var blockElement = $(currentRange.commonAncestorContainer).closest('[cid]')[0],
                blockLeft = (blockElement && blockElement.getBoundingClientRect().left) || 0;
              element.addClass('show').css({
                top: bounds.bottom + 'px',
                left: Math.max(blockLeft, bounds.right - element.width() + 20) + 'px',
              }),
                (customFocusElement = $(currentRange.commonAncestorContainer).closest(
                  '[md-inline]',
                ));
            }
          }, 100);
        }
      }),
      (F.prototype.getContextTarget = function () {
        return contextTarget;
      }),
      (F.prototype.getMenuItemsForMac = function (inputElement, skipRefocus) {
        if (
          ((contextTarget = inputElement),
          (targetBlockElement = $(contextTarget).closest('[cid]')),
          inputElement.closest &&
            !inputElement.closest('body') &&
            inputElement.closest('.CodeMirror-line') &&
            ((inputElement = document.activeElement.closest('.CodeMirror')),
            (contextTarget = inputElement)),
          !inputElement)
        )
          return [];
        if (
          void (
            inputElement.ownerDocument.defaultView != window &&
            (inputElement = (function e(frameWindow) {
              return frameWindow.parent == window
                ? frameWindow.frameElement
                : frameWindow && frameWindow.parent
                  ? e(frameWindow.parent)
                  : null;
            })(inputElement.ownerDocument.defaultView))
          ) ||
          document.querySelector('#write').contains(inputElement)
        )
          return (function () {
            var menuItems = [],
              currentItems = ['normal'];
            try {
              var markElement = editor.getMarkElem(inputElement);
              if (
                DocumentNode.isType(document.activeElement.tagName, 'INPUT', 'TEXTAREA') &&
                !markElement.length
              )
                return ['input'];
              markElement.length &&
                !skipRefocus &&
                (markElement.hasClass('md-diagram') ||
                  File.editor.refocus(markElement.attr('cid')));
              var currentRange = editor.selection.getRangy(),
                element = $(inputElement).closest('.md-expand'),
                blockType = markElement.attr('mdtype'),
                downloadAction = null;
              inputElement.closest('img, svg') && (downloadAction = 'download-image'),
                inputElement.closest('video') && (downloadAction = 'download-video'),
                markElement.attr('tabindex') &&
                  (menuItems = ['insertParagraphBefore', 'insertParagraphAfter', 'delete']),
                /^table/g.exec(blockType) &&
                  !File.isLocked &&
                  (menuItems = [
                    '|',
                    'table',
                    '|',
                    'insertParagraphBefore',
                    'insertParagraphAfter',
                  ]),
                DocumentNode.isType(blockType, NodeType.html_block) &&
                  (menuItems = [
                    '|',
                    'edit',
                    'code-tools',
                    '|',
                    'insertParagraphBefore',
                    'insertParagraphAfter',
                    'delete',
                  ]),
                DocumentNode.isType(blockType, NodeType.math_block) &&
                  ((downloadAction = null),
                  (menuItems = [
                    '|',
                    'edit',
                    'copyMathBlock',
                    'download-math',
                    'code-tools',
                    '|',
                    'insertParagraphBefore',
                    'insertParagraphAfter',
                    'delete',
                  ])),
                DocumentNode.isType(blockType, NodeType.fences) &&
                  (markElement.hasClass('md-diagram')
                    ? ((downloadAction = null),
                      (menuItems = [
                        '|',
                        'edit',
                        'copy-as-image',
                        'download-diagram',
                        'code-tools',
                        '|',
                        'insertParagraphBefore',
                        'insertParagraphAfter',
                        'delete',
                      ]))
                    : (menuItems = [
                        '|',
                        'code-tools',
                        '|',
                        'insertParagraphBefore',
                        'insertParagraphAfter',
                        'delete-fences',
                      ]));
              var targetElements = $(inputElement);
              if ((currentItems.push(downloadAction), markElement.hasClass('md-def-link'))) {
                var currentElement = $(currentRange.commonAncestorContainer).closest('.md-def-url');
                currentElement.length &&
                  (File.editor.setCurLinkElem(currentElement),
                  (currentItems = ['openLink', 'copyLink', '|', 'normal', downloadAction]));
              }
              targetElements.closest('a, .md-link').length &&
                (File.editor.setCurLinkElem(
                  targetElements.closest('a, .md-link').find('a').addBack('a'),
                ),
                (currentItems = ['openLink', 'copyLink', '|', 'normal', downloadAction])),
                targetElements.closest('.md-emoji').length &&
                  (currentItems = [
                    'copyEmoji-' +
                      targetElements.closest('.md-emoji').find('[data-emoji]').attr('data-emoji'),
                    '|',
                  ].concat(currentItems)),
                currentRange &&
                  $(currentRange.commonAncestorContainer).closest('.md-inline-math').length &&
                  (currentItems = ['copyMathInline', '|'].concat(currentItems)),
                DocumentNode.isType(
                  element.hasClass('md-img-loaded') && element.attr('md-inline'),
                  NodeType.refimg,
                ) &&
                  /^file:\/\//.exec(element.find('img').attr('src') || '') &&
                  (currentItems = ['revealInFinder', '|'].concat(currentItems)),
                DocumentNode.isType(
                  element.hasClass('md-img-loaded') && element.attr('md-inline'),
                  NodeType.image,
                  NodeType.imgtag,
                ) &&
                  (currentItems = File.editor.imgEdit
                    .contextMenuItems(element.find('img')[0])
                    .concat('revealInFinder' == currentItems[0] ? [] : ['|'])
                    .concat(currentItems));
            } catch (error) {}
            return currentItems.concat(menuItems).filter((item) => null != item);
          })();
        if (
          File.editor.sourceView.inSourceMode &&
          document.querySelector('#marklyra-source').contains(inputElement)
        )
          return ['input'];
        var targetElements = File.editor.getJQueryElem(inputElement),
          localElement = targetElements.closest(
            '.file-library-node, .marklyra-search-item, #file-library-search, #outline-content',
          );
        if (localElement.hasClass('outline-content')) {
          var outline = File.editor.library.outline,
            collapsible = !document.body.classList.contains('no-collapse-outline');
          return outline.isShown_
            ? ['highlight', '|', 'filter-on']
            : collapsible
              ? [
                  'highlight',
                  '|',
                  'filter-off',
                  '|',
                  'expand-all',
                  'collapse-all',
                  '|',
                  'collapsible-outline-on',
                  'flat-outline-off',
                ]
              : ['highlight', '|', 'filter-off', '|', 'collapsible-outline-off', 'flat-outline-on'];
        }
        if (localElement.hasClass('marklyra-search-item')) return ['file-search'];
        if ('file-library-search' == localElement.attr('id')) return ['file-search-empty'];
        if (File.editor.library.useTreeStyle) {
          if (localElement.length)
            return localElement.attr('data-path') == File.getMountFolder()
              ? [`folder-root${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`]
              : [
                  ('true' == localElement.attr('data-is-directory') ? 'folder' : 'file') +
                    (File.editor.library.isReadOnlyRoot() ? '-readonly' : ''),
                ];
          if (File.getMountFolder() && targetElements.closest('#file-library').length)
            return [`folder-root${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`];
        } else if (localElement.length)
          return [`file-list${File.editor.library.isReadOnlyRoot() ? '-readonly' : ''}`];
        return [];
      }),
      (F.prototype.downloadAsAction = function () {
        var diagramElement = targetBlockElement.find(
          '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
        )[0];
        mediaActions.downloadAs(diagramElement || contextTarget.closest('svg, img, video'));
      }),
      (F.prototype.copyAsImageAction = function () {
        var diagramElement = targetBlockElement.find(
          '.md-fences-adv-panel svg, .md-math-container svg, .md-mathjax-preview svg',
        )[0];
        mediaActions.copyImage(diagramElement || contextTarget.closest('svg, img, video'));
      }),
      (F.prototype.insertParagraphBefore = function () {
        File.editor.UserOp.insertParagraph(!0, void 0, targetBlockElement.closest('[cid]'));
      }),
      (F.prototype.insertParagraphAfter = function () {
        File.editor.UserOp.insertParagraph(!1, void 0, targetBlockElement.closest('[cid]'));
      }),
      (F.prototype.editActive = function () {
        File.editActive(contextTarget);
      }),
      (F.prototype.deleteActive = function () {
        File.deleteActive(contextTarget);
      }),
      (F.prototype.restoreLastCursor = x),
      (F.SPLITER = 'divider'),
      (moduleRecord.exports = F);
  },
);
