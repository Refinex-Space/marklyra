// ui/document-menu.
// SystemJS module 37. Dependencies: 1b, 13, 2c.
$__System.registerDynamic(
  '37',
  ['1b', '13', '2c'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self, requireModule('1b');
    var currentStyle,
      documentModel = requireModule('13'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      timerId = (requireModule('2c'), null);
    function l(menuPatch, menuPath, itemState) {
      menuPatch && (menuPatch[menuPath] = $.extend(menuPatch[menuPath], itemState));
    }
    function c(menuPatch) {
      var style = File.editor.styleBookmark.style;
      [
        'Copy as Plain Text',
        'Copy as Markdown',
        'Copy as HTML Code',
        'Copy without Theme Styling',
      ].map((item) => {
        menuPatch['Edit→' + item] = { enabled: !style || style.textSelected || !1 };
      });
    }
    function d(menuPatch, reuseBookmark) {
      if (((currentStyle = File.editor.styleBookmark.style), !menuPatch)) return;
      (menuPatch['Format→Inline Math'] = { hidden: !File.option.enableInlineMath }),
        (menuPatch['Format→Highlight'] = { hidden: !File.option.enableHighlight }),
        (menuPatch['Paragraph→Alert'] = { hidden: !File.option.enableAlert }),
        (menuPatch['Format→Subscript'] = { hidden: !File.option.enableSubscript }),
        (menuPatch['Format→Superscript'] = { hidden: !File.option.enableSubscript });
      var CONST = File.editor.stylize.CONST;
      !reuseBookmark && File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark());
      var style = File.editor.styleBookmark.style,
        cannotContainInline = style.cannotContainInline;
      c(menuPatch),
        style.block[0] == NodeType.def_footnote &&
          (cannotContainInline = cannotContainInline || File.editor.stylize.isAtFootnoteDefSpan()),
        (cannotContainInline =
          cannotContainInline || style.inline.indexOf(NodeType.inline_math) > -1),
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
            { enabled: !File.isLocked && !cannotContainInline, state: !1 },
            menuPatch['Format→' + item],
          );
        });
      var items = ['image', 'strong', 'em', 'link'],
        touchBarStyles = {},
        inline = File.editor.styleBookmark.style.inline;
      (inline || []).map(function (item) {
        'image' !== item && (menuPatch['Format→' + CONST.StyleToNameMap[item]] = { state: !0 }),
          items.remove(item),
          (touchBarStyles[CONST.StyleToNameMap[item]] = !0);
      }),
        inline.indexOf('link') > -1 ||
        inline.indexOf('autolink') > -1 ||
        inline.indexOf('url') > -1 ||
        inline.indexOf('reflink') > -1 ||
        style.block.indexOf('def_link') > -1
          ? (menuPatch['Format→Hyperlink Actions'] = { enabled: !0 })
          : (menuPatch['Format→Hyperlink Actions'] = { enabled: !1 });
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
      }),
        (menuPatch['Edit→Copy Image Content'] = { hidden: !1, visible: enabled, enabled: enabled }),
        inline.indexOf('refimg') > -1 &&
          (menuPatch['Format→Image→Switch Image Syntax'] = { hidden: !0, visible: !1 }),
        (menuPatch['Format→Image→Switch Image Syntax→Markdown Style'] = {
          state: inline.indexOf('image') > -1,
        }),
        (menuPatch['Format→Image→Switch Image Syntax→HTML Style'] = {
          state: inline.indexOf('imgtag') > -1,
        }),
        File.isMac &&
          (cannotContainInline ||
            items.map(function (item) {
              touchBarStyles[CONST.StyleToNameMap[item]] = !1;
            }),
          bridge.callHandler('touchBar.setInlineEnabled', !cannotContainInline),
          bridge.callHandler('touchBar.setInlineStates', touchBarStyles));
    }
    function u(leftStyles, rightStyles, defaultStyles) {
      if (!leftStyles) return !1;
      if (
        (defaultStyles &&
          (leftStyles.length || (leftStyles = defaultStyles),
          rightStyles.length || (rightStyles = defaultStyles)),
        leftStyles.length == rightStyles.length)
      ) {
        for (var itemIndex = 0; itemIndex < leftStyles.length; itemIndex++)
          if (leftStyles[itemIndex] != rightStyles[itemIndex]) return !1;
        return !0;
      }
      return !1;
    }
    var h = function (bookmark, forceRefresh) {
      timerId && clearTimeout(timerId);
      var delay = 60;
      currentStyle && currentStyle.inline.indexOf(NodeType.inline_math) > -1 && (delay = 50),
        File.isMacWK && (delay = 30),
        forceRefresh && (currentStyle = null),
        (timerId = setTimeout(function () {
          var style = (
              bookmark || File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark())
            ).style,
            changedItems = {};
          currentStyle && u(style.block, currentStyle.block)
            ? u(style.inline, currentStyle.inline, [NodeType.plain])
              ? style.textSelected != currentStyle.textSelected &&
                ((currentStyle = File.editor.styleBookmark.style), c(changedItems))
              : d(changedItems, !0)
            : (p(changedItems, !0), d(changedItems, !0)),
            Object.keys(changedItems).length > 0 && JSBridge.menu.update(changedItems);
        }, delay));
    };
    function p(menuPatch, reuseBookmark) {
      menuPatch || (menuPatch = {}),
        !reuseBookmark &&
          File.editor.stylize.putBookmark(null, File.editor.stylize.buildBookmark());
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
        l(menuPatch, 'Paragraph→' + item, {
          enabled: !File.isLocked && style.block.length > 0 && void 0 != normalBlockType,
          state: !1,
        });
      }),
        !(function () {
          try {
            return (
              File.editor
                .getMarkElem(window.getSelection().getRangeAt(0).startContainer)
                .attr('mdtype') == documentModel.TYPE.meta_block
            );
          } catch (error) {}
          return !1;
        })()
          ? [
              'Quote',
              'Ordered List',
              'Unordered List',
              'Task List',
              'Code Fences',
              'Math Block',
              'Insert Paragraph Before',
              'Insert Paragraph After',
            ].map(function (item) {
              l(menuPatch, 'Paragraph→' + item, { enabled: !0 });
            })
          : l(menuPatch, 'Paragraph→Paragraph', { enabled: !0 }),
        (File.editor.styleBookmark.style.block || []).indexOf(NodeType.meta_block) > -1
          ? l(menuPatch, 'Paragraph→Insert Paragraph Before', { enabled: !1 })
          : l(menuPatch, 'Paragraph→Insert Paragraph Before', { enabled: !0 }),
        DocumentNode.isType(
          style.block[0],
          NodeType.fences,
          NodeType.math_block,
          NodeType.html_block,
        )
          ? (l(menuPatch, 'Paragraph→Code Tools→Copy Code Content', { enabled: !0 }),
            l(menuPatch, 'Paragraph→Code Tools→Auto Indent Whole Code', { enabled: !0 }))
          : (l(menuPatch, 'Paragraph→Code Tools→Copy Code Content', { enabled: !1 }),
            l(menuPatch, 'Paragraph→Code Tools→Auto Indent Whole Code', { enabled: !1 }));
      var block,
        listType = null,
        underQuote = !1;
      if (
        ((File.editor.styleBookmark.style.block || []).map(function (item) {
          !listType && DocumentNode.isType(item, 'ol', 'ul', 'tasklist') && (listType = item),
            item == NodeType.blockquote && (underQuote = !0);
          var menuStyleName = File.editor.stylize.CONST.StyleToNameMap[item];
          l(menuPatch, 'Paragraph→' + menuStyleName, { state: !0 });
        }),
        'tasklist' == listType)
      ) {
        l(menuPatch, 'Paragraph→Task Status', { enabled: !0 });
        var state = 'checked' == File.editor.styleBookmark.style.state;
        l(menuPatch, 'Paragraph→Task Status→Mark as Complete', { state: state }),
          l(menuPatch, 'Paragraph→Task Status→Mark as Incomplete', { state: !state });
      } else l(menuPatch, 'Paragraph→Task Status', { enabled: !1 });
      File.isMac &&
        (File.editor.searchPanel.isOpen()
          ? bridge.callHandler('touchBar.showFindReplaceTouchBar')
          : document.body.classList.contains('modal-open')
            ? 'display' === document.querySelector('#table-insert-dialog').style
              ? bridge.callHandler('touchBar.showInsertTableTouchBar')
              : bridge.callHandler('touchBar.showDialogTouchBar')
            : bridge.callHandler('touchBar.setBlockStyle', {
                blockStyle:
                  File.editor.stylize.CONST.StyleToNameMap[
                    ((block = style.block),
                    block[0] == NodeType.table_cell ? NodeType.table : block[0])
                  ] || '',
                listType: listType,
                underQuote: underQuote,
                fallbackOnly: !normalBlockType,
              }));
    }
    function f(menuPatch) {
      var publishPatch = !1;
      menuPatch || ((menuPatch = {}), (publishPatch = !0));
      var state = File.editor && File.editor.sourceView && File.editor.sourceView.inSourceMode;
      if (
        ((menuPatch['View→Source Code Mode'] = { state: state, enabled: !File.isLocked }),
        JSBridge.invoke('window.updateMenuForIsAlwaysOnTop'),
        (menuPatch['View→Focus Mode'] = { state: File.isFocusMode, enabled: !0 }),
        (menuPatch['View→Typewriter Mode'] = { state: File.isTypeWriterMode, enabled: !0 }),
        File.editor && File.editor.library)
      ) {
        var sidebarVisible = File.editor.library.isSidebarShown(),
          activeTab = File.editor.library.getActiveTab();
        (menuPatch['View→Outline'] = {
          state: sidebarVisible && 'outline' == activeTab,
          enabled: !state,
        }),
          (menuPatch['View→Toggle Word Count Popover'] = { enabled: !state }),
          File.isMac && (menuPatch['View→Toggle Outline Popover'] = { enabled: !state }),
          (menuPatch['View→Articles'] = {
            state: sidebarVisible && 'file-library' == activeTab,
            enabled: !state,
          }),
          (menuPatch['View→File Tree'] = {
            state: sidebarVisible && 'file-tree' == activeTab,
            enabled: !state,
          }),
          (menuPatch['View→Search'] = {
            state: !(!sidebarVisible || !document.querySelector('.marklyra-on-search')),
            enabled: !state,
          }),
          (menuPatch['View→Toggle Sidebar'] = { enabled: !state });
      }
      publishPatch && JSBridge.menu.update(menuPatch);
    }
    var documentMenu = {
        doRefreshImageCopyStatus: function (disableImageActions, menuPatch) {
          if (File.editor && File.editor.imgEdit) {
            var text = File.editor.imgEdit.getTargetImageStorageFolder(),
              publishPatch = !1;
            menuPatch || ((menuPatch = {}), (publishPatch = !0)),
              l(menuPatch, 'Format→Image→Use Image Root Path', {
                state: !!File.editor.docMenu.getLocalRootUrl(),
              }),
              l(menuPatch, 'Format→Image→When Insert Local Image→Copy Image File to Folder…', {
                state: !!text && 'ipic' !== text.toLowerCase() && 'upload' !== text.toLowerCase(),
              }),
              l(menuPatch, 'Format→Image→When Insert Local Image→Upload Image', {
                state: text && ('ipic' == text.toLowerCase() || 'upload' == text.toLowerCase()),
              }),
              void 0 !== disableImageActions &&
                (l(menuPatch, 'Format→Image→Use Image Root Path', {
                  enabled: !disableImageActions,
                }),
                l(menuPatch, 'Format→Image→When Insert Local Image→Copy Image File to Folder…', {
                  enabled: !disableImageActions,
                }),
                l(menuPatch, 'Format→Image→When Insert Local Image→Upload Image', {
                  enabled: !disableImageActions,
                })),
              publishPatch && JSBridge.menu.update(menuPatch);
          }
        },
        refreshViewMenu: f,
        refreshBlockMenu: p,
        bindMenu: function () {
          documentMenu.freshMenu(!0),
            $(File.editor.sessionStr).on('cursorChange', function (unusedParameter1, bookmark) {
              h(bookmark);
            }),
            h();
        },
        freshMenu: function (refreshWindowState) {
          var isLocked =
            File.editor && File.editor.sourceView && File.editor.sourceView.inSourceMode;
          function n() {
            var menuPatch = {};
            if (
              (!File.isNode && f(menuPatch),
              (File.isMacWK || File.isMacLegacy) &&
                (menuPatch['Format→Image→Upload Local Images via iPic'] = {
                  enabled: !File.isLocked && !isLocked,
                }),
              (menuPatch['Format→Image→Insert Local Images…'] = { enabled: !File.isLocked }),
              (menuPatch['Edit→Delete'] = { enabled: !File.isLocked }),
              (menuPatch['Edit→Delete Range'] = { enabled: !File.isLocked }),
              (menuPatch['Edit→Cut'] = { enabled: !File.isLocked }),
              (menuPatch['Edit→Paste'] = { enabled: !File.isLocked }),
              c(menuPatch),
              (menuPatch['Edit→Line Endings'] = { enabled: !File.isLocked }),
              (menuPatch['Edit→Whitespace and Line Breaks'] = { enabled: !isLocked }),
              (menuPatch.Paragraph = { enabled: !File.isLocked && !isLocked }),
              (menuPatch.Format = { enabled: !File.isLocked && !isLocked }),
              File.setLineEnding(File.useCRLF, !1, !0),
              documentMenu.doRefreshImageCopyStatus(File.isLocked || isLocked, menuPatch),
              isLocked)
            ) {
              var historySize = File.editor.sourceView.cm.doc.historySize();
              (menuPatch['Edit→Undo'] = { enabled: !File.isLocked && historySize.undo > 0 }),
                (menuPatch['Edit→Redo'] = { enabled: !File.isLocked && historySize.redo > 0 }),
                File.isNode && window.ClientCommand.refreshViewMenu();
            } else
              (menuPatch['Edit→Undo'] = {
                enabled:
                  !File.isLocked && File.editor && File.editor.undo && File.editor.undo.hasUndo(),
              }),
                (menuPatch['Edit→Redo'] = {
                  enabled:
                    !File.isLocked && File.editor && File.editor.undo && File.editor.undo.hasRedo(),
                }),
                File.isNode
                  ? window.ClientCommand.refreshViewMenu()
                  : (menuPatch['View→Always on Top'] = { enabled: !0 }),
                !File.isLocked && h(void 0, !0);
            refreshWindowState &&
              File.isNode &&
              ((menuPatch['File→Open File Location'] = { enabled: !!File.bundle.filePath }),
              (menuPatch['File→Reveal in Sidebar'] = { enabled: !!File.bundle.filePath }),
              File.isWin && (menuPatch['File→Properties'] = { enabled: !!File.bundle.filePath }),
              !File.isMacNode &&
                (menuPatch['File→Reopen with Encoding'] = { hidden: !File.bundle.filePath }),
              (menuPatch['File→Delete…'] = { enabled: !!File.bundle.filePath })),
              refreshWindowState &&
                ((menuPatch['Edit→Whitespace and Line Breaks→Indent first line of paragraphs'] = {
                  state: File.option.indentFirstLine,
                  enabled: !isLocked,
                }),
                (menuPatch['Edit→Whitespace and Line Breaks→Visible <br/>'] = {
                  state: !File.option.hideBrAndLineBreak,
                  enabled: !isLocked,
                }),
                (menuPatch['Edit→Preserve single line break'] = {
                  state: File.option.ignoreLineBreak,
                  enabled: !isLocked,
                })),
              (menuPatch['Edit→Line Endings→Insert Final New Line On Save'] = {
                state: File.finalNewline,
              }),
              JSBridge.menu.update(menuPatch);
          }
          if (File.isNode) {
            try {
              n();
            } catch (error) {
              console.sendError(error, 'warning');
            }
            refreshWindowState && JSBridge.invoke('window.checkAsFocus');
          } else (File.isMac || File.isMacWK) && n();
        },
      },
      currentTimerId = null;
    (documentMenu.freshMenuWithDelay = function () {
      currentTimerId && (clearTimeout(currentTimerId), (currentTimerId = null)),
        (currentTimerId = setTimeout(File.freshMenu, 500));
    }),
      (documentMenu.forceRefreshMenu = function () {
        File.isLinux && JSBridge.sendIPC('forceRefreshMenu');
      }),
      (moduleRecord.exports = documentMenu);
  },
);
