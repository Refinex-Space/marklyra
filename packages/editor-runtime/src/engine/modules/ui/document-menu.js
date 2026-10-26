// ui/document-menu.
export default function initializeUiDocumentMenu(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  requireModule('editing/undo-manager');
  var currentStyle,
    documentModel = requireModule('model/document-model'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    timerId = (requireModule('host/environment'), null);
  function mergeMenuItemState(menuPatch, menuPath, itemState) {
    if (menuPatch) {
      menuPatch[menuPath] = $.extend(menuPatch[menuPath], itemState);
    }
  }
  function updateCopyMenuState(menuPatch) {
    var style = File.editor.styleBookmark.style;
    [
      'Copy as Plain Text',
      'Copy as Markdown',
      'Copy as HTML Code',
      'Copy without Theme Styling',
    ].map((item) => {
      menuPatch['Edit→' + item] = { enabled: !style || style.textSelected || false };
    });
  }
  function updateFormatMenuState(menuPatch, reuseBookmark) {
    currentStyle = File.editor.styleBookmark.style;
    if (!menuPatch) {
      return;
    }
    menuPatch['Format→Inline Math'] = { hidden: !File.option.enableInlineMath };
    menuPatch['Format→Highlight'] = { hidden: !File.option.enableHighlight };
    menuPatch['Paragraph→Alert'] = { hidden: !File.option.enableAlert };
    menuPatch['Format→Subscript'] = { hidden: !File.option.enableSubscript };
    menuPatch['Format→Superscript'] = { hidden: !File.option.enableSubscript };
    var CONST = File.editor.stylize.CONST;
    if (!reuseBookmark) {
      File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark());
    }
    var style = File.editor.styleBookmark.style,
      cannotContainInline = style.cannotContainInline;
    updateCopyMenuState(menuPatch);
    if (style.block[0] == NodeType.def_footnote) {
      cannotContainInline = cannotContainInline || File.editor.stylize.isAtFootnoteDefSpan();
    }
    cannotContainInline = cannotContainInline || style.inline.indexOf(NodeType.inline_math) > -1;
    [
      'Strong',
      'Emphasis',
      'Underline',
      'Code',
      'Strike',
      'Hyperlink',
      'Clear Format',
      'Inline Math',
      'Highlight',
      'Subscript',
      'Superscript',
      'Comment',
    ].map(function (item) {
      menuPatch['Format→' + item] = Object.assign(
        { enabled: !File.isLocked && !cannotContainInline, state: false },
        menuPatch['Format→' + item],
      );
    });
    var items = ['image', 'strong', 'em', 'link'],
      touchBarStyles = {},
      inline = File.editor.styleBookmark.style.inline;
    (inline || []).map(function (item) {
      if ('image' !== item) {
        menuPatch['Format→' + CONST.StyleToNameMap[item]] = { state: true };
      }
      items.remove(item);
      touchBarStyles[CONST.StyleToNameMap[item]] = true;
    });
    if (
      inline.indexOf('link') > -1 ||
      inline.indexOf('autolink') > -1 ||
      inline.indexOf('url') > -1 ||
      inline.indexOf('reflink') > -1 ||
      style.block.indexOf('def_link') > -1
    ) {
      menuPatch['Format→Hyperlink Actions'] = { enabled: true };
    } else {
      menuPatch['Format→Hyperlink Actions'] = { enabled: false };
    }
    const enabled =
        inline.indexOf('image') > -1 ||
        inline.indexOf('imgtag') > -1 ||
        inline.indexOf('refimg') > -1,
      isEmbeddedTextPackImage =
        enabled && File.isTextPack() && inline.indexOf('embed-resource') > -1;
    [
      'Open Image Location…',
      'Upload Image',
      'Copy Image to…',
      'Rename or Move Image to…',
      'Copy Image Content',
      'Zoom Image',
      'Delete Image File',
      'Switch Image Syntax',
    ].forEach((item) => {
      menuPatch[`Format→Image→${item}`] =
        'Open Image Location…' === item
          ? { enabled: enabled && !isEmbeddedTextPackImage }
          : { enabled: enabled };
    });
    menuPatch['Edit→Copy Image Content'] = { hidden: false, visible: enabled, enabled: enabled };
    if (inline.indexOf('refimg') > -1) {
      menuPatch['Format→Image→Switch Image Syntax'] = { hidden: true, visible: false };
    }
    menuPatch['Format→Image→Switch Image Syntax→Markdown Style'] = {
      state: inline.indexOf('image') > -1,
    };
    menuPatch['Format→Image→Switch Image Syntax→HTML Style'] = {
      state: inline.indexOf('imgtag') > -1,
    };
    if (File.isMac) {
      if (!cannotContainInline) {
        items.map(function (item) {
          touchBarStyles[CONST.StyleToNameMap[item]] = false;
        });
      }
      bridge.callHandler('touchBar.setInlineEnabled', !cannotContainInline);
      bridge.callHandler('touchBar.setInlineStates', touchBarStyles);
    }
  }
  function haveSameStyles(leftStyles, rightStyles, defaultStyles) {
    if (!leftStyles) {
      return false;
    }
    if (defaultStyles) {
      if (!leftStyles.length) {
        leftStyles = defaultStyles;
      }
      if (!rightStyles.length) {
        rightStyles = defaultStyles;
      }
    }
    if (leftStyles.length == rightStyles.length) {
      for (var itemIndex = 0; itemIndex < leftStyles.length; itemIndex++) {
        if (leftStyles[itemIndex] != rightStyles[itemIndex]) {
          return false;
        }
      }
      return true;
    }
    return false;
  }
  var scheduleMenuRefresh = function (bookmark, forceRefresh) {
    if (timerId) {
      clearTimeout(timerId);
    }
    var delay = 60;
    if (currentStyle && currentStyle.inline.indexOf(NodeType.inline_math) > -1) {
      delay = 50;
    }
    if (File.isMacWK) {
      delay = 30;
    }
    if (forceRefresh) {
      currentStyle = null;
    }
    timerId = setTimeout(function () {
      var style = (
          bookmark || File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark())
        ).style,
        changedItems = {};
      if (currentStyle && haveSameStyles(style.block, currentStyle.block)) {
        if (haveSameStyles(style.inline, currentStyle.inline, [NodeType.plain])) {
          if (style.textSelected != currentStyle.textSelected) {
            currentStyle = File.editor.styleBookmark.style;
            updateCopyMenuState(changedItems);
          }
        } else {
          updateFormatMenuState(changedItems, true);
        }
      } else {
        updateBlockMenuState(changedItems, true);
        updateFormatMenuState(changedItems, true);
      }
      if (Object.keys(changedItems).length > 0) {
        JSBridge.menu.update(changedItems);
      }
    }, delay);
  };
  function updateBlockMenuState(menuPatch, reuseBookmark) {
    if (!menuPatch) {
      menuPatch = {};
    }
    if (!reuseBookmark) {
      File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark());
    }
    var style = File.editor.styleBookmark.style,
      normalBlockType = File.editor.stylize.CONST.NormalBlockMap[style.block[0]];
    [
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4',
      'Heading 5',
      'Heading 6',
      'Paragraph',
      'Decrease Heading Level',
      'Increase Heading Level',
      'Table',
      'Code Fences',
      'Math Block',
      'Quote',
      'Ordered List',
      'Unordered List',
      'Task List',
      'Link Reference',
      'Footnotes',
      'YAML Front Matter',
      'Horizontal Line',
      'Table of Contents',
    ].map(function (item) {
      mergeMenuItemState(menuPatch, 'Paragraph→' + item, {
        enabled: !File.isLocked && style.block.length > 0 && void 0 != normalBlockType,
        state: false,
      });
    });
    if (
      !(function () {
        try {
          return (
            File.editor
              .getMarkElem(window.getSelection().getRangeAt(0).startContainer)
              .attr('mdtype') == documentModel.TYPE.meta_block
          );
        } catch (error) {}
        return false;
      })()
    ) {
      [
        'Quote',
        'Ordered List',
        'Unordered List',
        'Task List',
        'Code Fences',
        'Math Block',
        'Insert Paragraph Before',
        'Insert Paragraph After',
      ].map(function (item) {
        mergeMenuItemState(menuPatch, 'Paragraph→' + item, { enabled: true });
      });
    } else {
      mergeMenuItemState(menuPatch, 'Paragraph→Paragraph', { enabled: true });
    }
    if ((File.editor.styleBookmark.style.block || []).indexOf(NodeType.meta_block) > -1) {
      mergeMenuItemState(menuPatch, 'Paragraph→Insert Paragraph Before', { enabled: false });
    } else {
      mergeMenuItemState(menuPatch, 'Paragraph→Insert Paragraph Before', { enabled: true });
    }
    if (
      DocumentNode.isType(style.block[0], NodeType.fences, NodeType.math_block, NodeType.html_block)
    ) {
      mergeMenuItemState(menuPatch, 'Paragraph→Code Tools→Copy Code Content', { enabled: true });
      mergeMenuItemState(menuPatch, 'Paragraph→Code Tools→Auto Indent Whole Code', {
        enabled: true,
      });
    } else {
      mergeMenuItemState(menuPatch, 'Paragraph→Code Tools→Copy Code Content', { enabled: false });
      mergeMenuItemState(menuPatch, 'Paragraph→Code Tools→Auto Indent Whole Code', {
        enabled: false,
      });
    }
    var block,
      listType = null,
      underQuote = false;
    (File.editor.styleBookmark.style.block || []).map(function (item) {
      if (!listType && DocumentNode.isType(item, 'ol', 'ul', 'tasklist')) {
        listType = item;
      }
      if (item == NodeType.blockquote) {
        underQuote = true;
      }
      var menuStyleName = File.editor.stylize.CONST.StyleToNameMap[item];
      mergeMenuItemState(menuPatch, 'Paragraph→' + menuStyleName, { state: true });
    });
    if ('tasklist' == listType) {
      mergeMenuItemState(menuPatch, 'Paragraph→Task Status', { enabled: true });
      var state = 'checked' == File.editor.styleBookmark.style.state;
      mergeMenuItemState(menuPatch, 'Paragraph→Task Status→Mark as Complete', { state: state });
      mergeMenuItemState(menuPatch, 'Paragraph→Task Status→Mark as Incomplete', { state: !state });
    } else {
      mergeMenuItemState(menuPatch, 'Paragraph→Task Status', { enabled: false });
    }
    if (File.isMac) {
      if (File.editor.searchPanel.isOpen()) {
        bridge.callHandler('touchBar.showFindReplaceTouchBar');
      } else {
        if (document.body.classList.contains('modal-open')) {
          if ('display' === document.querySelector('#table-insert-dialog').style) {
            bridge.callHandler('touchBar.showInsertTableTouchBar');
          } else {
            bridge.callHandler('touchBar.showDialogTouchBar');
          }
        } else {
          bridge.callHandler('touchBar.setBlockStyle', {
            blockStyle:
              File.editor.stylize.CONST.StyleToNameMap[
                ((block = style.block), block[0] == NodeType.table_cell ? NodeType.table : block[0])
              ] || '',
            listType: listType,
            underQuote: underQuote,
            fallbackOnly: !normalBlockType,
          });
        }
      }
    }
  }
  function updateViewMenuState(menuPatch) {
    var publishPatch = false;
    if (!menuPatch) {
      menuPatch = {};
      publishPatch = true;
    }
    var state = File.editor && File.editor.sourceView && File.editor.sourceView.inSourceMode;
    menuPatch['View→Source Code Mode'] = { state: state, enabled: !File.isLocked };
    JSBridge.invoke('window.updateMenuForIsAlwaysOnTop');
    menuPatch['View→Focus Mode'] = { state: File.isFocusMode, enabled: true };
    menuPatch['View→Typewriter Mode'] = { state: File.isTypeWriterMode, enabled: true };
    if (File.editor && File.editor.library) {
      var sidebarVisible = File.editor.library.isSidebarShown(),
        activeTab = File.editor.library.getActiveTab();
      menuPatch['View→Outline'] = {
        state: sidebarVisible && 'outline' == activeTab,
        enabled: !state,
      };
      menuPatch['View→Toggle Word Count Popover'] = { enabled: !state };
      if (File.isMac) {
        menuPatch['View→Toggle Outline Popover'] = { enabled: !state };
      }
      menuPatch['View→Articles'] = {
        state: sidebarVisible && 'file-library' == activeTab,
        enabled: !state,
      };
      menuPatch['View→File Tree'] = {
        state: sidebarVisible && 'file-tree' == activeTab,
        enabled: !state,
      };
      menuPatch['View→Search'] = {
        state: !(!sidebarVisible || !document.querySelector('.marklyra-on-search')),
        enabled: !state,
      };
      menuPatch['View→Toggle Sidebar'] = { enabled: !state };
    }
    if (publishPatch) {
      JSBridge.menu.update(menuPatch);
    }
  }
  var documentMenu = {
      doRefreshImageCopyStatus: function (disableImageActions, menuPatch) {
        if (File.editor && File.editor.imgEdit) {
          var text = File.editor.imgEdit.getTargetImageStorageFolder(),
            publishPatch = false;
          if (!menuPatch) {
            menuPatch = {};
            publishPatch = true;
          }
          mergeMenuItemState(menuPatch, 'Format→Image→Use Image Root Path', {
            state: !!File.editor.docMenu.getLocalRootUrl(),
          });
          mergeMenuItemState(
            menuPatch,
            'Format→Image→When Insert Local Image→Copy Image File to Folder…',
            {
              state: !!text && 'ipic' !== text.toLowerCase() && 'upload' !== text.toLowerCase(),
            },
          );
          mergeMenuItemState(menuPatch, 'Format→Image→When Insert Local Image→Upload Image', {
            state: text && ('ipic' == text.toLowerCase() || 'upload' == text.toLowerCase()),
          });
          if (void 0 !== disableImageActions) {
            mergeMenuItemState(menuPatch, 'Format→Image→Use Image Root Path', {
              enabled: !disableImageActions,
            });
            mergeMenuItemState(
              menuPatch,
              'Format→Image→When Insert Local Image→Copy Image File to Folder…',
              {
                enabled: !disableImageActions,
              },
            );
            mergeMenuItemState(menuPatch, 'Format→Image→When Insert Local Image→Upload Image', {
              enabled: !disableImageActions,
            });
          }
          if (publishPatch) {
            JSBridge.menu.update(menuPatch);
          }
        }
      },
      refreshViewMenu: updateViewMenuState,
      refreshBlockMenu: updateBlockMenuState,
      bindMenu: function () {
        documentMenu.freshMenu(true);
        $(File.editor.sessionStr).on('cursorChange', function (unusedParameter1, bookmark) {
          scheduleMenuRefresh(bookmark);
        });
        scheduleMenuRefresh();
      },
      freshMenu: function (refreshWindowState) {
        var isLocked = File.editor && File.editor.sourceView && File.editor.sourceView.inSourceMode;
        function refreshNativeMenuState() {
          var menuPatch = {};
          if (!File.isNode) {
            updateViewMenuState(menuPatch);
          }
          if (File.isMacWK || File.isMacLegacy) {
            menuPatch['Format→Image→Upload Local Images via iPic'] = {
              enabled: !File.isLocked && !isLocked,
            };
          }
          menuPatch['Format→Image→Insert Local Images…'] = { enabled: !File.isLocked };
          menuPatch['Edit→Delete'] = { enabled: !File.isLocked };
          menuPatch['Edit→Delete Range'] = { enabled: !File.isLocked };
          menuPatch['Edit→Cut'] = { enabled: !File.isLocked };
          menuPatch['Edit→Paste'] = { enabled: !File.isLocked };
          updateCopyMenuState(menuPatch);
          menuPatch['Edit→Line Endings'] = { enabled: !File.isLocked };
          menuPatch['Edit→Whitespace and Line Breaks'] = { enabled: !isLocked };
          menuPatch.Paragraph = { enabled: !File.isLocked && !isLocked };
          menuPatch.Format = { enabled: !File.isLocked && !isLocked };
          File.setLineEnding(File.useCRLF, false, true);
          documentMenu.doRefreshImageCopyStatus(File.isLocked || isLocked, menuPatch);
          if (isLocked) {
            var historySize = File.editor.sourceView.cm.doc.historySize();
            menuPatch['Edit→Undo'] = { enabled: !File.isLocked && historySize.undo > 0 };
            menuPatch['Edit→Redo'] = { enabled: !File.isLocked && historySize.redo > 0 };
            if (File.isNode) {
              window.ClientCommand.refreshViewMenu();
            }
          } else {
            menuPatch['Edit→Undo'] = {
              enabled:
                !File.isLocked && File.editor && File.editor.undo && File.editor.undo.hasUndo(),
            };
            menuPatch['Edit→Redo'] = {
              enabled:
                !File.isLocked && File.editor && File.editor.undo && File.editor.undo.hasRedo(),
            };
            if (File.isNode) {
              window.ClientCommand.refreshViewMenu();
            } else {
              menuPatch['View→Always on Top'] = { enabled: true };
            }
            if (!File.isLocked) {
              scheduleMenuRefresh(void 0, true);
            }
          }
          if (refreshWindowState && File.isNode) {
            menuPatch['File→Open File Location'] = { enabled: !!File.bundle.filePath };
            menuPatch['File→Reveal in Sidebar'] = { enabled: !!File.bundle.filePath };
            if (File.isWin) {
              menuPatch['File→Properties'] = { enabled: !!File.bundle.filePath };
            }
            if (!File.isMacNode) {
              menuPatch['File→Reopen with Encoding'] = { hidden: !File.bundle.filePath };
            }
            menuPatch['File→Delete…'] = { enabled: !!File.bundle.filePath };
          }
          if (refreshWindowState) {
            menuPatch['Edit→Whitespace and Line Breaks→Indent first line of paragraphs'] = {
              state: File.option.indentFirstLine,
              enabled: !isLocked,
            };
            menuPatch['Edit→Whitespace and Line Breaks→Visible <br/>'] = {
              state: !File.option.hideBrAndLineBreak,
              enabled: !isLocked,
            };
            menuPatch['Edit→Preserve single line break'] = {
              state: File.option.ignoreLineBreak,
              enabled: !isLocked,
            };
          }
          menuPatch['Edit→Line Endings→Insert Final New Line On Save'] = {
            state: File.finalNewline,
          };
          JSBridge.menu.update(menuPatch);
        }
        if (File.isNode) {
          try {
            refreshNativeMenuState();
          } catch (error) {
            console.sendError(error, 'warning');
          }
          if (refreshWindowState) {
            JSBridge.invoke('window.checkAsFocus');
          }
        } else {
          if (File.isMac || File.isMacWK) {
            refreshNativeMenuState();
          }
        }
      },
    },
    currentTimerId = null;
  documentMenu.freshMenuWithDelay = function () {
    if (currentTimerId) {
      clearTimeout(currentTimerId);
      currentTimerId = null;
    }
    currentTimerId = setTimeout(File.freshMenu, 500);
  };
  documentMenu.forceRefreshMenu = function () {
    if (File.isLinux) {
      JSBridge.sendIPC('forceRefreshMenu');
    }
  };
  moduleRecord.exports = documentMenu;
}
