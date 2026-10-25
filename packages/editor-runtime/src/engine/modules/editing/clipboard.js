// editing/clipboard.
// SystemJS module 59. Dependencies: 11, 13, 1b, 1d, 19, 58, 3f, 2d, 5a, 17, 33, 57, 2a.
$__System.registerDynamic(
  '59',
  ['11', '13', '1b', '1d', '19', '58', '3f', '2d', '5a', '17', '33', '57', '2a'],
  !0,
  function (requireModule, moduleExports, moduleRecord) {
    'use strict';
    this || self;
    var utilities = requireModule('11'),
      documentModel = requireModule('13'),
      undoManager = requireModule('1b'),
      DocumentNode = documentModel.Node,
      NodeType = documentModel.TYPE,
      nodeCollectionUtilities = documentModel.NodeCollectionUtils,
      markdownParser = (requireModule('1d'), requireModule('19')),
      tableEditor = requireModule('58'),
      htmlParser = requireModule('3f'),
      formatting = requireModule('2d'),
      htmlBlocks = (requireModule('5a'), requireModule('17')),
      deletion = (requireModule('33'), requireModule('57')),
      mediaActions = requireModule('2a'),
      electron = window.reqnode ? reqnode('electron') : null,
      backspaceHandler = deletion.backspaceHandler,
      y = function (documentNode) {
        return (
          DocumentNode.isEmptyBlock(documentNode) ||
          (DocumentNode.isType(documentNode, NodeType.list_item) &&
            1 == documentNode.get('children').length &&
            DocumentNode.isEmptyBlock(documentNode.getFirstChild()))
        );
      },
      b = function (
        editorInstance,
        targetNode,
        text,
        insertionOffset,
        insertCommand,
        restoreCursor,
      ) {
        if (
          (console.debug('insertInlineText'),
          (targetNode =
            targetNode ||
            ((nodeElement = editorInstance.getMarkElem()),
            editorInstance.getNode(nodeElement.attr('cid')))))
        ) {
          var element = editorInstance.getJQueryElem(window.getSelection().anchorNode),
            nodeElement = editorInstance.findElemById(targetNode.id);
          DocumentNode.noChangeLine(targetNode) && (text = text.trim().split(/[\n\r]+/gi)[0]),
            '\n' == text && nodeElement.text().length <= insertionOffset && (text = '\n​'),
            insertCommand &&
              insertCommand.undo.push(undoManager.buildReplaceUndo(targetNode, void 0));
          var elementLength = element.closest('.md-def-link, .md-def-footnote').length,
            currentText = '';
          if (elementLength && element.hasClass('md-def-name'))
            (nodeElement = element.closest('[cid]')),
              editorInstance.selection
                .getRangy()
                .insertNode(document.createTextNode(utilities.escape(text))),
              targetNode.set('ref', element.text());
          else if (elementLength && element.hasClass('md-def-url'))
            (nodeElement = element.closest('[cid]')),
              (text = text.replace(/\s/gi, '')),
              editorInstance.selection
                .getRangy()
                .insertNode(document.createTextNode(utilities.escape(text))),
              targetNode.set('href', element.text());
          else if (elementLength && element.hasClass('md-def-title'))
            (nodeElement = element.closest('[cid]')),
              editorInstance.selection
                .getRangy()
                .insertNode(document.createTextNode(utilities.escape(text))),
              targetNode.set('title', element.text());
          else {
            var localText,
              endOffset = insertionOffset;
            if (element.hasClass('md-meta-block') && 0 == element.text().length && '\n​' == text)
              localText = '\n\n';
            else {
              if (
                (element.hasClass('md-meta-block') &&
                currentText.length == insertionOffset &&
                '\n' == currentText[insertionOffset - 1]
                  ? insertionOffset--
                  : elementLength && element.closest('.md-def-content').length
                    ? ((endOffset -= (targetNode.get('ref') || '').length + 1),
                      (currentText = element.closest('.md-def-content').rawText()))
                    : ((currentText = nodeElement.rawText()),
                      DocumentNode.isType(targetNode, NodeType.meta_block) &&
                        (currentText = currentText.replace(/\n$/, ''))),
                element.hasClass('md-meta-block') && '\t' == text)
              ) {
                var textSlice = currentText.substring(0, endOffset);
                (textSlice && !/\n\s*$/.exec(textSlice)) ||
                  (text = ' '.repeat(File.option.indentSize));
              }
              localText =
                void 0 !== endOffset
                  ? currentText.substring(0, endOffset) + text + currentText.substring(endOffset)
                  : currentText.text() + text;
            }
            targetNode.set('text', localText.replace(/\u200B/g, '')),
              nodeElement.html(
                $(markdownParser.renderHtmlWithBlockMeta(targetNode, editorInstance.brush)).html(),
              );
          }
          insertCommand &&
            (editorInstance.store(targetNode, !0),
            insertCommand.redo.push(undoManager.buildReplaceUndo(targetNode, void 0)));
          var cursorSnapshot = {
            id: targetNode.id,
            type: 'cursor',
            start: insertionOffset + text.length,
          };
          if (((nodeElement = editorInstance.findElemById(targetNode.id)), restoreCursor)) {
            var match = currentText.match(/\u200b:|:\u200b/);
            match || nodeElement.find('.md-emoji-control-ch').text(''),
              editorInstance.undo.exeCommand(cursorSnapshot),
              match || nodeElement.find('.md-emoji-control-ch').text('​'),
              editorInstance.brush.addToQueue(targetNode.id),
              (cursorSnapshot = editorInstance.selection.buildUndo());
          }
          insertCommand && insertCommand.redo.push(cursorSnapshot),
            editorInstance.brush.addToQueue(targetNode.id),
            restoreCursor && nodeElement.addClass('md-focus'),
            nodeElement.length && editorInstance.refreshUnder(nodeElement[0]);
        }
      },
      w = function (htmlContent, textSlice, text, clearMissingFormats, event) {
        if (File.isMac)
          !(function (htmlContent, markHtml, plainText, clearMissingFormats) {
            var clipboardFormats = {};
            utilities.isDefined(htmlContent) && (clipboardFormats['text/html'] = E(htmlContent)[0]),
              utilities.isDefined(markHtml) && (clipboardFormats['text/markhtml'] = markHtml),
              utilities.isDefined(plainText) && (clipboardFormats['text/plain'] = plainText),
              JSBridge.clipboard.writeForMac(clipboardFormats, clearMissingFormats);
          })(htmlContent, textSlice, text, clearMissingFormats);
        else if (File.isNode)
          if (event) {
            if ('cut_before' === File._CopyContentFlag || ('cut' == event.type && htmlContent)) {
              if (!htmlContent)
                return (
                  JSBridge.invoke('webContents.copy'), void (File._CopyContentFlag = 'cut_after')
                );
              backspaceHandler(File.editor, null, 'delSelection'), (File._CopyContentFlag = !1);
            } else if ('cut_after' === File._CopyContentFlag) {
              (File._CopyContentFlag = !1),
                (htmlContent = (E(electron.clipboard.readHTML()) || [])[0]);
              let selectionSnapshot =
                  File._CopyContentRange && editor.selection.buildUndo(File._CopyContentRange),
                cutCommand = backspaceHandler(File.editor, null, 'delSelection', !0);
              if (File._CopyContentRange) {
                if (cutCommand) {
                  cutCommand.undo.unshift(selectionSnapshot);
                  let cleanupCommand = backspaceHandler(editor, null, !0, !0);
                  cleanupCommand && undoManager.append(cutCommand, cleanupCommand);
                } else backspaceHandler(editor, null, !0);
                File._CopyContentRange = null;
              }
              editor.undo.register(cutCommand);
            } else if (htmlContent && !File._CopyContentFlag);
            else {
              if (!File._CopyContentFlag)
                return (
                  (File._CopyContentFlag = !0),
                  void (!htmlContent && JSBridge.invoke('webContents.copy'))
                );
              !0 !== File._CopyContentFlag ||
                (null !== htmlContent && void 0 != htmlContent) ||
                (htmlContent = (E(electron.clipboard.readHTML() || htmlContent) || [])[0] || '') ||
                console.debug('failed to read html from clipboard'),
                !textSlice &&
                  /^markhtml\|/.exec(File._CopyContentFlag + '') &&
                  (textSlice = File._CopyContentFlag.substring('markhtml|'.length)),
                (File._CopyContentFlag = !1);
            }
            !(function (htmlContent, markHtml, plainText, clearMissingFormats, clipboardEvent) {
              null != plainText
                ? clipboardEvent.clipboardData.setData('text/plain', plainText)
                : clearMissingFormats && clipboardEvent.clipboardData.setData('text/plain', ''),
                null != htmlContent
                  ? clipboardEvent.clipboardData.setData('text/html', htmlContent)
                  : clearMissingFormats && clipboardEvent.clipboardData.setData('text/html', ''),
                null != markHtml
                  ? clipboardEvent.clipboardData.setData('text/markhtml', markHtml)
                  : clearMissingFormats &&
                    clipboardEvent.clipboardData.setData('text/markhtml', '');
            })(htmlContent, textSlice, text, clearMissingFormats, event),
              event.preventDefault();
          } else
            JSBridge.invoke(
              'clipboard.write',
              JSON.stringify({ html: E(htmlContent)[0] || text, text: text }),
              clearMissingFormats || !1,
            ),
              textSlice
                ? ((File._CopyContentFlag = 'markhtml|' + textSlice),
                  JSBridge.invoke('webContents.copy'))
                : (File._CopyContentFlag = !1);
      },
      x = function (editorInstance, clipboardEvent, copyAsPlainText) {
        editorInstance = editorInstance || File.editor;
        var activeElement = document.activeElement,
          range = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode)
          w(null, null, File.editor.sourceView.cm.getSelection(), !0, clipboardEvent);
        else if ('HR' == activeElement.getAttribute('mdtype'))
          w(null, null, '---', !0, clipboardEvent);
        else if (
          activeElement.getAttribute('mdtype') !== NodeType.math_block ||
          (range && !range.collapsed)
        ) {
          if (isInputComponent(activeElement) || void 0 !== activeElement.tabindex)
            w(null, null, activeElement.value || activeElement.textContent, !0, clipboardEvent);
          else if (window.getSelection().rangeCount) {
            var element, markHtml;
            range.collapsed &&
              (element = (element = $(range.startContainer).closest('.md-table-fig')).length
                ? htmlParser.getMarkElemFromCurrentHtml(element[0].outerHTML, editorInstance)
                : null),
              element ||
                (element = htmlParser.getMarkElemFromCurrentHtml(range.toHtml(), editorInstance)),
              (markHtml = element.html()),
              w(
                null,
                copyAsPlainText ? null : markHtml,
                copyAsPlainText ? T(markHtml).replace(/\u200B/gi, '') : A(markHtml),
                !0,
                clipboardEvent,
              );
          }
        } else
          w(
            null,
            null,
            '$$\n' + editorInstance.mathBlock.getTex(activeElement.getAttribute('cid')) + '\n$$',
            !0,
            clipboardEvent,
          );
        File._CopyContentFlag = !1;
      };
    function C(htmlContent, editorInstance, prettyForRendering) {
      var markHtml,
        parsedBlocks = _(
          (markHtml = htmlParser.getMarkElemFromCurrentHtml(htmlContent, editorInstance).html()),
          void 0,
          void 0,
          void 0,
          !0,
        );
      return [
        editorInstance.export.exportCollection(parsedBlocks, null, {
          forPrint: !1,
          noStyle: !0,
          exportFooter: !0,
          prettyForRendering: prettyForRendering,
          split: '\n',
        }),
        markHtml,
        File.option.copyMarkdownByDefault ? A(markHtml) : T(markHtml),
      ];
    }
    var F = function (editorInstance, clipboardEvent) {
        x(editorInstance, clipboardEvent, !0);
      },
      S = function (editorInstance, clipboardEvent) {
        editorInstance = editorInstance || File.editor;
        var activeElement = document.activeElement,
          selectionRange = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode)
          w(null, null, File.editor.sourceView.cm.getSelection(), !0, clipboardEvent);
        else if ('HR' == activeElement.getAttribute('mdtype'))
          w(null, null, '<hr/>', !0, clipboardEvent);
        else if (
          activeElement.getAttribute('mdtype') !== NodeType.math_block ||
          (selectionRange && !selectionRange.collapsed)
        ) {
          if (isInputComponent(activeElement) || 0 == activeElement.childElementCount) {
            if (
              activeElement.classList.contains('md-content') &&
              selectionRange.toString() == activeElement.textContent
            ) {
              var element = $(activeElement).closest('.md-image');
              if (element.length) {
                var exportedHtml = C(element[0].outerHTML, editorInstance)[0];
                return void w(
                  null,
                  "<pre mdtype='fences' lang='HTML'>" + utilities.escape(exportedHtml) + '</pre>',
                  exportedHtml,
                  !0,
                  clipboardEvent,
                );
              }
            }
            w(null, null, activeElement.value || activeElement.textContent, !0, clipboardEvent);
          } else if (window.getSelection().rangeCount) {
            exportedHtml = C(selectionRange.toHtml(), editorInstance)[0];
            w(
              null,
              "<pre mdtype='fences' lang='HTML'>" + utilities.escape(exportedHtml) + '</pre>',
              exportedHtml,
              !0,
              clipboardEvent,
            );
          }
        } else
          w(
            null,
            null,
            '$$\n' + editorInstance.mathBlock.getTex(activeElement.getAttribute('cid')) + '\n$$',
            !0,
            clipboardEvent,
          );
      },
      k = function (editorInstance, clipboardEvent) {
        editorInstance = editorInstance || File.editor;
        var nodeId,
          clipboardFormats,
          activeElement = document.activeElement,
          selectionRange = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode)
          w(null, null, File.editor.sourceView.cm.getSelection(), !0, clipboardEvent);
        else if ('HR' == activeElement.getAttribute('mdtype')) {
          var documentNode = editorInstance.getNode(activeElement.getAttribute('cid'));
          w('<hr/>', null, documentNode.get('text'), !0, clipboardEvent);
        } else if (
          activeElement.getAttribute('mdtype') !== NodeType.math_block ||
          (selectionRange && !selectionRange.collapsed)
        )
          if (isInputComponent(activeElement) || 0 == activeElement.childElementCount) {
            if (activeElement.classList.contains('md-content'))
              if (selectionRange.toString() == activeElement.textContent)
                if ($(activeElement).closest('.md-image').length)
                  return (
                    (clipboardFormats = C(selectionRange.toHtml(), editorInstance, !0)),
                    void w(
                      clipboardFormats[0],
                      clipboardFormats[1],
                      clipboardFormats[2],
                      !0,
                      clipboardEvent,
                    )
                  );
            w(
              activeElement.value || activeElement.textContent,
              null,
              activeElement.value || activeElement.textContent,
              !0,
              clipboardEvent,
            );
          } else
            window.getSelection().rangeCount &&
              ((clipboardFormats = C(selectionRange.toHtml(), editorInstance, !0)),
              w(clipboardFormats[0], clipboardFormats[1], clipboardFormats[2], !0, clipboardEvent));
        else {
          nodeId = activeElement.getAttribute('cid');
          var currentDocumentNode = editorInstance.getNode(nodeId);
          w(
            editorInstance.export.getSVGForExport(currentDocumentNode, !1),
            '$$\n' + editorInstance.mathBlock.getTex(nodeId) + '\n$$',
            '$$\n' + editorInstance.mathBlock.getTex(nodeId) + '\n$$',
            !0,
            clipboardEvent,
          );
        }
      },
      E = function (htmlContent) {
        if (!htmlContent) return ['', ''];
        File.isMac &&
          (htmlContent.match(/<\/p>/g) || []).length - (htmlContent.match(/<p/g) || []).length ==
            1 &&
          (htmlContent = '<p>' + htmlContent);
        var parsedNodes = $.parseHTML('<div>' + htmlContent + '</div>'),
          cleanHtml = '<!DOCTYPE html>',
          spacedHtml = '<!DOCTYPE html>',
          linePrefix = File.option.showLineNumbersForFence ? '&nbsp;' : '';
        if (!parsedNodes.length) return ['', ''];
        var clipboardElement = $(parsedNodes[0]),
          elements = clipboardElement.find('.md-emoji');
        elements.text(function (emojiIndex) {
          return $(elements[emojiIndex]).children('[data-emoji]').attr('data-emoji');
        }),
          clipboardElement.find('.md-pants').text(function () {
            return this.dataset.content;
          }),
          clipboardElement
            .find(
              '.marklyra-table-edit, .md-meta, .md-content, .md-rawblock-tooltip, .md-tooltip-hide, span p, .md-meta-none, .md-reverse-footnote-area',
            )
            .remove(),
          clipboardElement.find('[cid].md-fences').html(function () {
            var fenceElement = $(this);
            fenceElement.children('[cid]').each(function () {
              fenceElement.after(this);
            }),
              (fenceElement[0].style.whiteSpace = 'pre');
            var currentElements = this.querySelectorAll('pre.CodeMirror-line');
            if (currentElements.length) {
              for (
                var textParts = [], itemIndex = 0;
                itemIndex < currentElements.length;
                itemIndex++
              )
                currentElements[itemIndex].innerHTML &&
                  textParts.push(linePrefix + currentElements[itemIndex].innerHTML);
              return textParts.join('<br/>');
            }
            return this.innerHTML;
          }),
          clipboardElement
            .find('p, h1, h2, h3, h4, h5, h6, .md-def-link, .md-def-footnoote')
            .css('width', ''),
          clipboardElement.find('.md-br').text('\n'),
          clipboardElement.find('.md-def-name').before('[').after(']   '),
          clipboardElement.find('.task-list-item > p').replaceWith(function () {
            return (
              (this.previousElementSibling && 'INPUT' == this.previousElementSibling.tagName
                ? ' '
                : '') +
              this.innerHTML +
              (this.nextSibling ? '\n' : '')
            );
          }),
          clipboardElement.find('.md-entity').text(function () {
            return this.dataset.content;
          }),
          clipboardElement.find('[contenteditable]').removeAttr('contenteditable');
        var searchValue = location.href.replace(/[^\/\\]+.html/, '');
        return (
          clipboardElement.find('a').attr('href', function (unusedParameter1, text) {
            return text && 0 == text.indexOf(location.href)
              ? text.substr(location.href.length)
              : text && 0 == text.indexOf(searchValue)
                ? text.substr(searchValue.length)
                : text;
          }),
          clipboardElement.find('img[data-real-src]').attr('src', function () {
            return this.dataset.realSrc;
          }),
          clipboardElement
            .find('.mathjax-block')
            .addBack('.mathjax-block')
            .html('$$<br /><span></span><br />$$')
            .find('span')
            .text(function () {
              try {
                return File.editor.getNode(this.parentElement.getAttribute('cid')).get('text');
              } catch (error) {
                return '';
              }
            })
            .end()
            .after('<br />'),
          clipboardElement.find('.md-inline-math').text(function () {
            var elementId = this.getAttribute('id'),
              element = document.querySelector('#' + elementId);
            return (element && (element.querySelector('script') || {}).innerText) || '';
          }),
          clipboardElement.find('[style]').attr('style', function (unusedParameter1, styleText) {
            return (styleText || '').replace(/\s--[^;]+;/g, '');
          }),
          (cleanHtml += clipboardElement.html()),
          clipboardElement.find('.md-toc').remove(),
          clipboardElement.find('li p').replaceWith(function () {
            return this.innerHTML + (this.nextSibling ? '\n' : '');
          }),
          clipboardElement
            .find(
              'ul, ol, .md-def-link, .md-toc, .md-def-footnoote, blockquote, .md-fences, .mathjax-block',
            )
            .after('<br/><br/>'),
          clipboardElement.find('.md-def-name').before('[').after(']   '),
          [cleanHtml, (spacedHtml += clipboardElement.html())]
        );
      };
    function T(markHtml) {
      var parsedBlocks = htmlParser.getBlocksFromMarkHtml(markHtml, null, !0);
      return 'string' == typeof parsedBlocks
        ? parsedBlocks
        : htmlParser.convertToPlain(parsedBlocks);
    }
    function _(markHtml, nodeMap, unusedParameter3, unusedParameter4, preserveDomIdentity) {
      return htmlParser.getBlocksFromMarkHtml(markHtml, nodeMap, !1, preserveDomIdentity);
    }
    function A(markHtml) {
      var parsedBlocks = _(markHtml, void 0, 0, 0, !0);
      return 'string' == typeof parsedBlocks
        ? parsedBlocks
        : DocumentNode.markFromArr(parsedBlocks);
    }
    var savedCopyRange,
      L = function (editorInstance, pasteInput, pasteAsPlainText, selectionRestoreOverride) {
        var remap,
          clipboardBaseUrl = '';
        if (((File._PasteContentFlag = !1), (editorInstance = editorInstance || File.editor))) {
          'function' == typeof selectionRestoreOverride && (R = selectionRestoreOverride);
          var markhtml,
            html = 'string' != typeof pasteInput || pasteAsPlainText ? null : pasteInput,
            currentText = 'string' == typeof pasteInput && pasteAsPlainText ? pasteInput : null,
            event = 'object' == typeof pasteInput ? pasteInput : null;
          if (
            (event && event.commonHtml
              ? ((html = event.commonHtml), (event = null))
              : event && event.markhtml && ((markhtml = event.markhtml), (event = null)),
            'INPUT' == document.activeElement.tagName ||
              (document.activeElement.classList &&
                document.activeElement.classList.contains('marklyra-input')))
          )
            return !0;
          if ('TEXTAREA' == document.activeElement.tagName) {
            if ((console.debug('pasteHandler: focused in input element'), !event && currentText)) {
              var element = $(document.activeElement).closest('.CodeMirror');
              element && (element = element[0].CodeMirror).replaceSelection(currentText);
            }
            return !0;
          }
          if (DocumentNode.isType(targetNode, NodeType.hr)) return !1;
          if ('BODY' == document.activeElement.tagName) return !1;
          var range,
            start,
            pasteCommand =
              editorInstance.UserOp.backspaceHandler(
                editorInstance,
                null,
                'delSelection',
                !0,
                !1,
              ) || undoManager.makeEmptyCommand(),
            targetElement = editorInstance.getMarkElem(),
            targetNode = editorInstance.findNodeByElem(targetElement),
            clipboardContent = { markhtml: markhtml, html: html, text: currentText };
          event
            ? (event.preventDefault(), JSBridge.clipboard.read(event, clipboardContent).then(H))
            : clipboardContent.html || clipboardContent.text || clipboardContent.markhtml
              ? H(clipboardContent)
              : JSBridge.clipboard.read(null, clipboardContent).then(H);
        }
        function L(documentNode, unusedParameter2) {
          return documentNode.get('attr') && documentNode.get('attr').trim().length
            ? documentNode.get('attr')
            : void 0;
        }
        function D(documentNode) {
          return DocumentNode.isType(
            documentNode,
            DocumentNode.TYPE.paragraph,
            DocumentNode.TYPE.heading,
            DocumentNode.TYPE.raw_edit,
            DocumentNode.TYPE.fences,
            DocumentNode.TYPE.table_cell,
          )
            ? documentNode.get('text')
            : (!DocumentNode.isType(documentNode, NodeType.def_footnote) ||
                  (L(documentNode) && L(documentNode))) &&
                (!DocumentNode.isType(documentNode, NodeType.def_link) ||
                  (L(documentNode) && L(documentNode)))
              ? documentNode
                  .get('children')
                  .toArray()
                  .reduce(function (accumulatedText, childNode) {
                    return accumulatedText + D(childNode);
                  }, ' ')
              : L(blocks[0]) || L(blocks[0]) || L(blocks[0]) || L(blocks[0]) || '';
        }
        function R(nodeId, startOffset, inputNodeId, endOffset, unusedParameter5) {
          if (!selectionRestoreOverride)
            try {
              var selectionRange = editorInstance.selection.restoreEdge(
                editorInstance.findElemById(nodeId),
                startOffset,
              );
              void 0 !== endOffset
                ? (selectionRange = editorInstance.selection.restoreEdge(
                    editorInstance.findElemById(inputNodeId),
                    endOffset,
                    !0,
                    selectionRange,
                  ))
                : selectionRange.setEndAfter(
                    editorInstance.findElemById(inputNodeId)[0] ||
                      editorInstance.findElemById(nodeId)[0],
                  ),
                editorInstance.imgEdit.tryMoveImageInRange(selectionRange, !0),
                editorInstance.stylize.putBookmark(
                  null,
                  editorInstance.stylize.buildBookmark(editorInstance.findElemById(inputNodeId)),
                ),
                $(editorInstance.sessionStr).trigger('cursorChange', editorInstance.styleBookmark);
            } catch (error) {
              console.error(error);
            }
        }
        function B(
          callbackDocumentNode,
          insertionOffset,
          pasteCommand,
          sourceContent,
          parseContent,
          fallbackText,
        ) {
          pasteCommand.undo.push(editorInstance.selection.buildUndo());
          var items = parseContent(
            sourceContent,
            editorInstance.nodeMap,
            editorInstance,
            clipboardBaseUrl,
            remap,
          );
          if ('string' == typeof items)
            return I(
              callbackDocumentNode,
              insertionOffset,
              items || fallbackText || '',
              pasteCommand,
              !0,
            );
          if (1 == items.length && insertionOffset) {
            let inlineText = (function e(documentNode) {
              var childrenLength = documentNode.get('children').length;
              return childrenLength
                ? 1 == childrenLength
                  ? e(documentNode.getFirstChild())
                  : '\n\n\n'
                : documentNode.get('text') || '';
            })(items[0]);
            if (-1 == inlineText.indexOf('\n'))
              return I(callbackDocumentNode, insertionOffset, inlineText, pasteCommand);
          } else if (0 == items.length) return;
          if (DocumentNode.isType(callbackDocumentNode, NodeType.table_cell))
            !(function (targetCell, insertionOffset, inputItems, pasteCommand) {
              var TableEdit = editorInstance.tableEdit.TableEdit;
              function c(targetCell, substringLength, sourceNode, unusedParameter4) {
                var text = targetCell.safeGetStrAttr('text'),
                  insertedText = D(sourceNode).replace(/\r?\n/g, ' ');
                return (
                  targetCell.set(
                    'text',
                    text.substr(0, substringLength) + insertedText + text.substr(substringLength),
                  ),
                  substringLength + insertedText.length
                );
              }
              var cursorOffset,
                parentNode = targetCell.get('parent').get('parent'),
                currentCell = targetCell,
                lastCell = currentCell;
              pasteCommand.undo.push(undoManager.buildReplaceUndo(parentNode));
              var currentItems = [],
                sourceRows = [];
              inputItems.forEach(function (sourceNode, unusedParameter2) {
                sourceNode.get('type') == NodeType.table
                  ? (sourceRows = sourceRows.concat(
                      (function (documentNode) {
                        function t(inputDocumentNode) {
                          for (
                            var currentDocumentNode = inputDocumentNode.getFirstChild(),
                              localItems = [];
                            currentDocumentNode;
                          )
                            localItems.push(currentDocumentNode),
                              (currentDocumentNode = currentDocumentNode.get('after'));
                          return localItems;
                        }
                        for (
                          var tableRows = [], localDocumentNode = documentNode.getFirstChild();
                          localDocumentNode;
                        )
                          tableRows.push(t(localDocumentNode)),
                            (localDocumentNode = localDocumentNode.get('after'));
                        return tableRows;
                      })(sourceNode),
                    ))
                  : 0 == sourceRows.length
                    ? ((sourceRows = [currentItems]), currentItems.push(sourceNode))
                    : 1 == sourceRows.length && currentItems.push(sourceNode);
              });
              for (
                var targetRow = targetCell.get('parent'),
                  startColumn = TableEdit.getColumnIndex(targetCell),
                  availableColumns = Math.min(
                    sourceRows[0].length,
                    targetRow.get('children').length - startColumn,
                  ),
                  itemIndex = 0;
                itemIndex < sourceRows.length;
                itemIndex++
              ) {
                currentItems = sourceRows[itemIndex];
                for (
                  var currentItemIndex = 0;
                  currentItemIndex < currentItems.length && currentCell;
                  currentItemIndex++
                )
                  (cursorOffset = c(
                    currentCell,
                    0 === itemIndex && 0 === currentItemIndex ? insertionOffset : 0,
                    currentItems[currentItemIndex],
                  )),
                    (lastCell = currentCell),
                    (currentCell = DocumentNode.isType(
                      currentItems[currentItemIndex],
                      NodeType.table_cell,
                    )
                      ? TableEdit.getSibling(currentCell, !1, !0)
                      : TableEdit.getNextCellInColumn(currentCell));
                if (!(targetRow = targetRow.get('after'))) break;
                0 == itemIndex &&
                  sourceRows.length > 1 &&
                  ((startColumn -= Math.max(0, sourceRows[1].length - availableColumns)),
                  (startColumn = Math.max(startColumn, 0))),
                  (currentCell = TableEdit.getCellAt(targetRow, startColumn));
              }
              editorInstance.findElemById(parentNode.id).replaceWith(parentNode.toHTML()),
                pasteCommand.redo.push(undoManager.buildReplaceUndo(parentNode)),
                void 0 !== cursorOffset
                  ? editorInstance.selection.jumpInto(
                      editorInstance.findElemById(lastCell.id),
                      cursorOffset,
                    )
                  : editorInstance.selection.jumpIntoElemEnd(
                      editorInstance.findElemById(lastCell.id),
                    ),
                pasteCommand.redo.push(editorInstance.selection.buildUndo());
            })(callbackDocumentNode, insertionOffset, items, pasteCommand);
          else if (DocumentNode.isType(callbackDocumentNode, NodeType.table_row, NodeType.table));
          else {
            DocumentNode.isType(callbackDocumentNode.get('parent'), NodeType.list_item)
              ? pasteCommand.undo.push(
                  editorInstance.undo.buildReplaceUndo(callbackDocumentNode.get('parent')),
                )
              : pasteCommand.undo.push(editorInstance.undo.buildReplaceUndo(callbackDocumentNode));
            var atDocumentStart =
                callbackDocumentNode === editorInstance.nodeMap.getFirst() && 0 === insertionOffset,
              disallowedMetaBlocks = [];
            items.map(function (item, itemIndex) {
              DocumentNode.isType(item, NodeType.meta_block) &&
                (0 != itemIndex || !atDocumentStart) &&
                disallowedMetaBlocks.push(item);
            }),
              disallowedMetaBlocks.map(function (item) {
                items.remove(item);
              });
            var splitResult = DocumentNode.splitAt(
              callbackDocumentNode,
              insertionOffset,
              editorInstance,
              !1,
              !0,
              !0,
            );
            if (!splitResult) return void editorInstance.undo.register(pasteCommand);
            if (
              (O(
                splitResult.prev,
                splitResult.next,
                items,
                pasteCommand,
                splitResult.insertArray,
                callbackDocumentNode,
              ),
              splitResult.prev && items.last())
            )
              try {
                var selectionStartNode = splitResult.prev.isDeleted() ? items[0] : splitResult.prev,
                  lastInsertedNode = items.last();
                !splitResult.prev.isDeleted() &&
                  DocumentNode.isType(splitResult.prev, NodeType.list_item) &&
                  (lastInsertedNode.isDeleted() || splitResult.prev.contains(items.last())) &&
                  (selectionStartNode = splitResult.prev.getVeryFirst()),
                  R(
                    selectionStartNode.getVeryFirst(!0, !1).cid,
                    insertionOffset,
                    items.last().cid,
                    void 0,
                  );
              } catch (error) {
                window.Reporter.error(error);
              }
          }
          editorInstance.undo.register(pasteCommand);
        }
        function P(
          documentNode,
          inputDocumentNode,
          mergeCommand,
          insertedNodes,
          copySourceFormatting,
        ) {
          if (
            documentNode &&
            !documentNode.isDeleted() &&
            inputDocumentNode &&
            !inputDocumentNode.isDeleted()
          ) {
            var textLength,
              currentDocumentNode = documentNode.canContainBlock()
                ? documentNode.getLastChild()
                : documentNode,
              localDocumentNode = inputDocumentNode.canContainBlock()
                ? inputDocumentNode.getFirstChild()
                : inputDocumentNode;
            if (
              editorInstance.stylize.canContainInline(currentDocumentNode) &&
              editorInstance.stylize.canContainInline(localDocumentNode) &&
              !DocumentNode.isType(currentDocumentNode, NodeType.table_cell) &&
              !DocumentNode.isType(localDocumentNode, NodeType.table_cell)
            ) {
              textLength = currentDocumentNode.get('text').length;
              var mergedText = currentDocumentNode.get('text') + localDocumentNode.get('text');
              copySourceFormatting &&
                !textLength &&
                currentDocumentNode.copyContentFrom(localDocumentNode),
                currentDocumentNode.set('text', mergedText);
              var removableAncestor = (function e(callbackDocumentNode) {
                if (callbackDocumentNode && !callbackDocumentNode.isDeleted()) {
                  var parentNode = callbackDocumentNode.get('parent');
                  return parentNode
                    ? callbackDocumentNode.get('before') || callbackDocumentNode.get('after')
                      ? callbackDocumentNode
                      : e(parentNode)
                    : callbackDocumentNode;
                }
              })(localDocumentNode);
              return (
                mergeCommand && undoManager.addUndoForRemove(mergeCommand, removableAncestor),
                removableAncestor.remove(),
                insertedNodes.remove(removableAncestor),
                inputDocumentNode.isDeleted() ||
                  (DocumentNode.isType(inputDocumentNode, NodeType.list_item) &&
                    DocumentNode.isType(documentNode, NodeType.list_item) &&
                    (mergeCommand &&
                      mergeCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
                    documentNode.getLastChild().addAfterTillEnd(inputDocumentNode.getFirstChild()),
                    mergeCommand && undoManager.addUndoForRemove(mergeCommand, inputDocumentNode),
                    inputDocumentNode.remove(),
                    insertedNodes.remove(inputDocumentNode))),
                mergeCommand && mergeCommand.redo.push(undoManager.buildReplaceUndo(documentNode)),
                textLength
              );
            }
          }
        }
        function I(documentNode, insertionOffset, inputText, pasteCommand, preserveEdgeNewlines) {
          console.debug('pasteText'),
            (inputText = inputText.replace(/\u00a0/g, ' ').replace(/\u200b/g, '')),
            preserveEdgeNewlines ||
              (inputText = inputText.replace(/^[\r\n]+/g, '').replace(/[\r\n]+$/g, ''));
          var parts = inputText.split(/\r?\n/g);
          if (
            (parts.length > 1 &&
              !parts[0].trim().length &&
              parts[1].trim().length &&
              (parts = parts.slice(1)),
            DocumentNode.isType(documentNode, NodeType.table_cell))
          )
            return (function (inputDocumentNode, endOffset, text, pasteCommand) {
              pasteCommand.undo.push(editorInstance.selection.buildUndo()),
                (text = text
                  .replace(/^\s*(\r?\n)+/, '')
                  .replace(/^\s*(\r?\n)+$/, '')
                  .replace(/(^\s*\|)|(\|\s*)/g, '|'));
              var cellSeparator = null;
              /\|/.exec(text) && (cellSeparator = /\s*\|\s*/);
              var itemLength,
                localDocumentNode = inputDocumentNode.get('parent'),
                isNonPipeTable = 'npTable' == localDocumentNode.get('parent').get('style'),
                childrenLength = localDocumentNode.get('children').length,
                currentDocumentNode = inputDocumentNode;
              if (cellSeparator) {
                var filteredItems = text.split(/\n/).filter(function (item) {
                    return item.length;
                  }),
                  childIndex = tableEditor.getColumnIndex(inputDocumentNode);
                filteredItems.map(function (item, itemIndex) {
                  if (localDocumentNode && !/^[-\s:|]+$/.exec(item)) {
                    var items = markdownParser.splitTableCell(
                      item,
                      isNonPipeTable,
                      childrenLength,
                    ) || [item];
                    '' == items[0] && (items = items.subarray(1)),
                      '' == items.last() && (items = items.subarray(0, items.length - 1));
                    var targetCell = localDocumentNode.getNthChild(childIndex);
                    items.map(function (inputItem, inputItemIndex) {
                      targetCell &&
                        (pasteCommand.undo.push(undoManager.buildReplaceUndo(targetCell)),
                        0 == itemIndex && 0 == inputItemIndex
                          ? (inputDocumentNode.set(
                              'text',
                              inputDocumentNode.get('text').substring(0, endOffset) +
                                inputItem +
                                inputDocumentNode.get('text').substring(endOffset),
                            ),
                            (itemLength = endOffset + inputItem.length))
                          : (inputItemIndex == items.length - 1
                              ? targetCell.set('text', inputItem + targetCell.get('text'))
                              : targetCell.set('text', inputItem),
                            (currentDocumentNode = targetCell),
                            (itemLength = inputItem.length)),
                        pasteCommand.redo.push(undoManager.buildReplaceUndo(targetCell)),
                        (targetCell = targetCell.get('after')));
                    }),
                      editorInstance
                        .findElemById(localDocumentNode.id)
                        .replaceWith(localDocumentNode.toHTML()),
                      (localDocumentNode = localDocumentNode.get('after'));
                  }
                });
              } else
                pasteCommand.undo.push(undoManager.buildReplaceUndo(inputDocumentNode)),
                  (text = text.replace(/<br\/?>/g, '\n').replace(/\r?\n/g, '<br/>')),
                  inputDocumentNode.set(
                    'text',
                    inputDocumentNode.get('text').substring(0, endOffset) +
                      text +
                      inputDocumentNode.get('text').substring(endOffset),
                  ),
                  pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode)),
                  editorInstance
                    .findElemById(inputDocumentNode.id)
                    .replaceWith(inputDocumentNode.toHTML()),
                  (itemLength = endOffset + text.length);
              var nodeElement = editorInstance.findElemById(currentDocumentNode.cid);
              editorInstance.selection.jumpInto(nodeElement, itemLength),
                pasteCommand.redo.push(editorInstance.selection.buildUndo()),
                editorInstance.undo.register(pasteCommand),
                nodeElement.length && editorInstance.refreshUnder(nodeElement[0]),
                R(
                  inputDocumentNode.cid,
                  0,
                  currentDocumentNode.cid,
                  currentDocumentNode.get('text').length,
                );
            })(documentNode, insertionOffset, inputText, pasteCommand);
          if (
            (DocumentNode.noChangeLine(documentNode) && (parts = [parts[0]]),
            parts.length <= 1 || formatting.CONST.NoInline.indexOf(documentNode.get('type')) > -1)
          )
            (inputText = parts.join('\n')),
              b(editorInstance, documentNode, inputText, insertionOffset, pasteCommand, !0),
              (function (
                editorInstance,
                inputDocumentNode,
                insertedText,
                insertionOffset,
                pasteCommand,
              ) {
                if (
                  DocumentNode.isType(inputDocumentNode, NodeType.paragraph) &&
                  htmlBlocks.BLOCK_OPEN_REG.exec(insertedText) &&
                  htmlBlocks.BLOCK_OPEN_REG.exec(inputDocumentNode.get('text'))
                ) {
                  var cursorSnapshot = pasteCommand.redo.last(),
                    parseResult = inputDocumentNode.parseFrom({
                      skips: { old_code: !1, pass_format: !0 },
                    });
                  pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode)),
                    undoManager.addUndoForInsertArray(pasteCommand, parseResult[1].subarray(1));
                  var lastParsedNode = parseResult[1].last().getVeryFirst(!0),
                    cursorOffset = cursorSnapshot.end || insertedText.length + insertionOffset;
                  editorInstance.findElemById(inputDocumentNode.id).replaceWith(parseResult[0]),
                    editorInstance.selection.jumpInto(
                      editorInstance.findElemById(lastParsedNode.cid),
                      cursorOffset,
                    ),
                    pasteCommand.redo.push(editorInstance.selection.buildUndo());
                }
              })(editorInstance, documentNode, inputText, insertionOffset, pasteCommand);
          else {
            if (
              (pasteCommand.undo.push(editorInstance.selection.buildUndo()),
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
              DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)
                ? pasteCommand.undo.push(undoManager.buildReplaceUndo(documentNode.get('parent')))
                : pasteCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
                !DocumentNode.isType(documentNode.get('parent'), NodeType.list_item))
            )
              return (function (inputDocumentNode, endOffset, insertedText, pasteCommand) {
                var text = inputDocumentNode.get('text');
                inputDocumentNode.set(
                  'text',
                  text.substring(0, endOffset) + insertedText + text.substring(endOffset),
                );
                var parseResult = inputDocumentNode.parseFrom({
                  skips: { old_code: !1, pass_format: !0 },
                });
                pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode)),
                  undoManager.addUndoForInsertArray(pasteCommand, parseResult[1].subarray(1)),
                  editorInstance.findElemById(inputDocumentNode.id).replaceWith(parseResult[0]);
                var currentDocumentNode = parseResult[1].last().getVeryFirst(!0),
                  cursorOffset = Math.max(
                    currentDocumentNode.get('text').length - (text.length - endOffset),
                    0,
                  );
                editorInstance.selection.jumpInto(
                  editorInstance.findElemById(currentDocumentNode.cid),
                  cursorOffset,
                ),
                  pasteCommand.redo.push(editorInstance.selection.buildUndo()),
                  editorInstance.undo.register(pasteCommand),
                  (editorInstance.focusCid = currentDocumentNode.cid),
                  editorInstance.refresh(),
                  R(
                    inputDocumentNode.cid,
                    0,
                    currentDocumentNode.cid,
                    currentDocumentNode.get('text').length,
                  );
              })(documentNode, insertionOffset, inputText, pasteCommand);
            var splitResult = DocumentNode.splitAt(documentNode, insertionOffset, editorInstance);
            if (!splitResult) return void editorInstance.undo.register(pasteCommand);
            var parsedBlocks = DocumentNode.parseFrom(
              parts.join('\n'),
              documentNode.get('in'),
              {
                noTop: !splitResult.prev.get('attachTo'),
                skips: { old_code: !1, pass_format: !0 },
              },
              !0,
            );
            DocumentNode.isType(splitResult.prev, NodeType.list_item) &&
              pasteCommand.undo.push(undoManager.buildReplaceUndo(splitResult.prev)),
              O(
                splitResult.prev,
                splitResult.next,
                parsedBlocks[1],
                pasteCommand,
                splitResult.insertArray,
                documentNode,
              );
          }
          editorInstance.undo.register(pasteCommand),
            R(
              documentNode.cid,
              insertionOffset,
              documentNode.cid,
              insertionOffset + inputText.length,
              pasteCommand,
            );
        }
        function O(precedingNode, searchValue, items, pasteCommand, inputItems, originalNode) {
          console.debug('pasteBlocks');
          var currentSearchValue,
            nodeId = originalNode.id,
            mergedCursorOffset = -1;
          (items = (function (sourceBlocks) {
            for (
              var currentItems = [], previousCellIndex = -2, itemIndex = 0;
              itemIndex < sourceBlocks.length;
              itemIndex++
            ) {
              var documentNode = sourceBlocks[itemIndex];
              DocumentNode.isType(documentNode, NodeType.table_cell)
                ? (previousCellIndex !== itemIndex - 1
                    ? (documentNode.set('type', NodeType.paragraph),
                      currentItems.push(documentNode))
                    : (currentItems
                        .last()
                        .set(
                          'text',
                          currentItems.last().get('text') + '  ' + documentNode.get('text'),
                        ),
                      documentNode.remove()),
                  (previousCellIndex = itemIndex))
                : currentItems.push(documentNode);
            }
            return currentItems;
          })(
            (items = (function (callbackItems) {
              var type,
                hasListItems,
                currentItems = [];
              if (
                (callbackItems.map(function (documentNode) {
                  DocumentNode.isType(documentNode, NodeType.list_item)
                    ? ((hasListItems = !0),
                      type ||
                        ((type = new DocumentNode({ type: type, in: documentNode.get('in') })),
                        currentItems.push(type)),
                      type.appendChild(documentNode))
                    : ((type = null), currentItems.push(documentNode));
                }),
                hasListItems)
              ) {
                console.log('group list items');
                var previousNode = callbackItems[0].get('before'),
                  nextNode = callbackItems.last().get('after'),
                  parentNode = callbackItems[0].get('parent');
                if (previousNode) previousNode.addArrayAfter(currentItems, !0);
                else if (nextNode) nextNode.addArrayBefore(currentItems, !0);
                else if (parentNode)
                  currentItems.forEach((inputItem) => parentNode.appendChild(inputItem));
                else {
                  var item;
                  currentItems.forEach((inputItem) => {
                    item && item.addAfter(inputItem), (item = inputItem);
                  });
                }
              }
              return currentItems;
            })(items)),
          )),
            (currentSearchValue = items.last().getVeryFirst(!0));
          var insertionIndex = (inputItems = inputItems || [searchValue]).indexOf(searchValue),
            removedFollowingNode = !1;
          if (
            (y(searchValue)
              ? (inputItems.remove(searchValue), searchValue.remove(), (removedFollowingNode = !0))
              : DocumentNode.isType(currentSearchValue, formatting.CONST.Selectable) &&
                (currentSearchValue = searchValue),
            !DocumentNode.isType(precedingNode, NodeType.blockquote, NodeType.list) &&
              !DocumentNode.isType(items[0], NodeType.list_item))
          ) {
            if (DocumentNode.isType(precedingNode, NodeType.list_item))
              !(function (documentNode, inputDocumentNode, copySourceFormatting) {
                console.debug('handlerPasteIntoList');
                var currentDocumentNode = documentNode.get('parent');
                DocumentNode.isType(items[0], NodeType.list) ||
                  (function () {
                    var listClone = currentDocumentNode.clone();
                    if (DocumentNode.isType(items[0], NodeType.list_item))
                      items.forEach((item) => {
                        if (DocumentNode.isType(item, NodeType.list_item))
                          currentDocumentNode.appendChild(item);
                        else {
                          let documentNodeInstance = new DocumentNode({ type: NodeType.list_item });
                          currentDocumentNode.appendChild(documentNodeInstance),
                            documentNodeInstance.appendChild(item);
                        }
                      });
                    else {
                      var currentDocumentNodeInstance = new DocumentNode({
                        type: NodeType.list_item,
                      });
                      listClone.appendChild(currentDocumentNodeInstance),
                        items.forEach((item) => {
                          currentDocumentNodeInstance.appendChild(item);
                        });
                    }
                    items = [listClone];
                  })(),
                  (nodeId = documentNode.id),
                  pasteCommand.undo.push(undoManager.buildAttrUndo(currentDocumentNode, 'tail')),
                  documentNode.addAfter(items[0]);
                var currentItems = items.shift().unwrap();
                (copySourceFormatting && !y(documentNode)) ||
                  (void 0 != P(documentNode, currentItems[0], null, [], copySourceFormatting) &&
                    currentItems.splice(0, 1)),
                  inputDocumentNode.isDeleted() ||
                    items.length ||
                    P(currentItems.last(), inputDocumentNode, null, []),
                  inputDocumentNode.isDeleted() || currentItems.push(inputDocumentNode),
                  pasteCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
                var replacementNodes = DocumentNode.genArrFrom(documentNode);
                if (
                  (undoManager.addUndoForInsertArray(pasteCommand, currentItems),
                  editorInstance
                    .findElemById(documentNode.cid)
                    .replaceWith(
                      nodeCollectionUtilities.toHTML([documentNode].concat(currentItems)),
                    ),
                  currentSearchValue.isDeleted() && (currentSearchValue = inputDocumentNode),
                  items.length)
                )
                  if (
                    (currentDocumentNode.unset('tail'),
                    inputDocumentNode.isDeleted() &&
                      (inputDocumentNode =
                        (inputDocumentNode = currentItems.last()) &&
                        inputDocumentNode.get('after')),
                    inputDocumentNode)
                  ) {
                    var trailingList = currentDocumentNode.clone();
                    trailingList.unset('start'), trailingList.unset('ahead');
                    var removedNodes = DocumentNode.genArrFrom(inputDocumentNode);
                    undoManager.addUndoForRemoveArray(pasteCommand, removedNodes),
                      trailingList.appendChildrenTillEnd(inputDocumentNode),
                      currentDocumentNode.addAfter(trailingList),
                      currentDocumentNode.addArrayAfter(items),
                      (replacementNodes = items.concat([trailingList])),
                      undoManager.addUndoForInsertArray(pasteCommand, replacementNodes),
                      editorInstance
                        .findElemById(currentDocumentNode.cid)
                        .replaceWith(
                          nodeCollectionUtilities.toHTML(
                            [currentDocumentNode].concat(replacementNodes),
                          ),
                        ),
                      currentSearchValue.isDeleted() && (currentSearchValue = inputDocumentNode);
                  } else
                    currentDocumentNode.addArrayAfter(items),
                      undoManager.addUndoForInsertArray(pasteCommand, items),
                      editorInstance
                        .findElemById(currentDocumentNode.cid)
                        .after(nodeCollectionUtilities.toHTML(items));
              })(precedingNode, searchValue, removedFollowingNode);
            else {
              var insertionLeaf = precedingNode.getVeryFirst(!0);
              insertionLeaf.addArrayAfter(items),
                insertionIndex > -1 &&
                  inputItems.splice.apply(inputItems, [insertionIndex, 0].concat(items)),
                undoManager.addUndoForInsertArray(pasteCommand, inputItems);
              var copyTrailingFormatting = items.length > 1;
              DocumentNode.isEmptyBlock(insertionLeaf)
                ? (undoManager.addUndoForRemove(pasteCommand, insertionLeaf),
                  insertionLeaf.remove(),
                  (copyTrailingFormatting = DocumentNode.isEmptyBlock(items.last())))
                : ((copyTrailingFormatting = !1),
                  P(insertionLeaf, items.shift(), pasteCommand, inputItems)),
                searchValue.isDeleted() ||
                  (DocumentNode.isEmptyBlock(searchValue)
                    ? (undoManager.addUndoForRemove(pasteCommand, searchValue),
                      searchValue.remove())
                    : (mergedCursorOffset = items.length
                        ? P(
                            items.last(),
                            searchValue,
                            pasteCommand,
                            inputItems,
                            copyTrailingFormatting,
                          )
                        : P(precedingNode, searchValue, pasteCommand, inputItems))),
                (currentSearchValue = items.last() || precedingNode) &&
                  !currentSearchValue.isDeleted() &&
                  (currentSearchValue = currentSearchValue.getVeryFirst(!0)),
                originalNode.isDeleted() ||
                  pasteCommand.redo.push(undoManager.buildReplaceUndo(originalNode));
              var replacementHtml =
                (originalNode.isDeleted() ? '' : originalNode.toHTML()) +
                inputItems
                  .map(function (item) {
                    return item.isDeleted() ? '' : item.toHTML();
                  })
                  .join('');
              editorInstance.mathBlock.beforeRenderMath(),
                editorInstance.findElemById(nodeId).replaceWith(replacementHtml);
            }
            DocumentNode.isType(currentSearchValue, formatting.CONST.Selectable) &&
              (searchValue && !searchValue.isDeleted() && (currentSearchValue = searchValue),
              (mergedCursorOffset = -1));
            try {
              mergedCursorOffset >= 0
                ? editorInstance.selection.jumpInto(
                    editorInstance.findElemById(currentSearchValue.cid),
                    mergedCursorOffset,
                  )
                : currentSearchValue == searchValue
                  ? editorInstance.selection.jumpIntoElemBegin(
                      editorInstance.findElemById(searchValue.cid),
                    )
                  : currentSearchValue.isDeleted()
                    ? editorInstance.selection.jumpIntoElemBegin(
                        editorInstance.findElemById(searchValue.cid),
                      )
                    : editorInstance.selection.jumpIntoElemEnd(
                        editorInstance.findElemById(currentSearchValue.getVeryFirst(!0).cid),
                      ),
                currentSearchValue.isDeleted() ||
                  pasteCommand.redo.push(editorInstance.selection.buildUndo());
            } catch (error) {
              console.warn(error);
            }
            editorInstance.tryEnterBusyMode(),
              setTimeout(function () {
                editorInstance.refocus(), editorInstance.refresh();
              }, 0),
              setTimeout(function () {
                editorInstance.selection.scrollAdjust();
              }, 100);
          }
        }
        function H(clipboardContent) {
          if (
            (pasteCommand.undo.push(editorInstance.selection.buildUndo()),
            (pasteCommand = undoManager.append(
              pasteCommand,
              backspaceHandler(editorInstance, event, 'delSelection', !0),
            )),
            (targetNode = editorInstance.findNodeByElem(editorInstance.getMarkElem())),
            (range = editorInstance.selection.getRangy()),
            targetNode && range)
          ) {
            start = range.getBookmark(editorInstance.findElemById(targetNode.id)[0]).start;
            var currentElement = editorInstance.getJQueryElem(range.startContainer);
            if (
              ((pasteAsPlainText =
                pasteAsPlainText ||
                (range.startContainer &&
                  currentElement.closest('.md-def-url, .md-def-name, .md-def-title, pre, code')
                    .length)),
              (markhtml = clipboardContent.markhtml),
              (html = clipboardContent.html),
              (currentText = clipboardContent.text),
              (clipboardBaseUrl = clipboardContent.baseUrlInClipboard || ''),
              (remap = clipboardContent.remap),
              markhtml && (markhtml = markhtml.replace(/[\u0000-\u0008\u000b-\u001f]/g, '')),
              html && (html = html.replace(/[\u0000-\u0008\u000b-\u001f]/g, '')),
              currentText &&
                (currentText = currentText.replace(/[\u0000-\u0008\u000b-\u001f]/g, '')),
              pasteAsPlainText)
            )
              utilities.isDefined(currentText) ||
                (currentText = htmlParser.parseInlineHTML(
                  html,
                  editorInstance,
                  clipboardBaseUrl,
                  remap,
                )),
                I(targetNode, start, (currentText = currentText || ''), pasteCommand);
            else if (markhtml) {
              var clipboardElement = $($.parseHTML('<div>' + markhtml + '</div>')[0]);
              (selectionRestoreOverride =
                selectionRestoreOverride ||
                (clipboardElement.find('[data-copy-from-path]').attr('data-copy-from-path') ||
                  '-1') === File.bundle.filePath),
                B(targetNode, start, pasteCommand, clipboardElement, _);
            } else if (html)
              currentElement.closest('.md-def-content').length
                ? ((currentText =
                    (currentText = htmlParser.parseInlineHTML(
                      html,
                      editorInstance,
                      clipboardBaseUrl,
                      remap,
                    )) ||
                    clipboardContent.text ||
                    ''),
                  I(targetNode, start, currentText, pasteCommand))
                : B(targetNode, start, pasteCommand, html, htmlParser.parseHTML, currentText);
            else {
              if (!(clipboardContent.files || []).length)
                return void JSBridge.clipboard.readImage().then(function (result) {
                  result && result.length
                    ? N(editorInstance, result, pasteCommand)
                    : I(targetNode, start, currentText || '', pasteCommand),
                    editorInstance.selection.scrollAdjust(),
                    window.Reporter.fullValidate();
                });
              N(editorInstance, clipboardContent.files, pasteCommand),
                editorInstance.undo.addSnap(targetNode.id, 0),
                editorInstance.selection.scrollAdjust();
            }
            editorInstance.undo.addSnap(targetNode.id, 0),
              editorInstance.selection.scrollAdjust(),
              window.Reporter.fullValidate();
          }
        }
      },
      N = function (editorInstance, filePaths, pasteCommand) {
        if ((pasteCommand && editorInstance.undo.register(pasteCommand), File.isMac)) {
          if (File.bundle.isLocked) return;
        } else if (File.isLocked) return !1;
        editorInstance.sourceView.inSourceMode || mediaActions.insertURLs(filePaths);
      };
    window.bridge &&
      bridge.registerHandler('clipboard.processClipboardHTML', function (htmlContent, respond) {
        D(File.editor), respond(E(htmlContent));
      });
    var D = function (editorInstance) {
      savedCopyRange &&
        (document.body.classList.remove('marklyra-on-copy'),
        !0 !== savedCopyRange && editorInstance.selection.setRange(savedCopyRange));
    };
    (moduleExports.getMarkdownSourceFrom = A),
      (moduleExports.nativeCopyText = function (plainText) {
        var textareaElement = document.createElement('textarea');
        document.body.appendChild(textareaElement),
          (textareaElement.value = plainText),
          textareaElement.focus(),
          textareaElement.select(),
          document.execCommand('Copy'),
          textareaElement.remove();
      }),
      (moduleExports.copyAsMarkdown = x),
      (moduleExports.copyAsSemanticHTML = k),
      (moduleExports.copyAsHTMLSource = S),
      (moduleExports.copyAsPlainText = F),
      (moduleExports.copyHandler = function (editorInstance, clipboardEvent, afterCopy) {
        if ('copyAsMarkdown' === File._CopyContentFlag)
          return x(editorInstance, clipboardEvent), !0;
        if ('copyAsHTMLSource' === File._CopyContentFlag)
          return S(editorInstance, clipboardEvent), !0;
        if ('copyAsSemanticHTML' === File._CopyContentFlag)
          return k(editorInstance, clipboardEvent), !0;
        if ('copyAsPlainText' === File._CopyContentFlag)
          return F(editorInstance, clipboardEvent), !0;
        var domNode = document.activeElement,
          range = editorInstance.selection.getRangy(),
          element = $(domNode).closest('[cid]');
        if (editorInstance.sourceView.inSourceMode) {
          let selection = File.editor.sourceView.cm.getSelection();
          return selection && w(null, null, selection, !0, clipboardEvent), !0;
        }
        if (isInputComponent(domNode))
          return clipboardEvent || console.sendError("in copyHandler : shouldn't be here"), !0;
        if ('hr' == domNode.getAttribute('mdtype'))
          return w(domNode.outerHTML, null, '---', !0, clipboardEvent), !0;
        if ('toc' == domNode.getAttribute('mdtype'))
          return w(domNode.outerHTML, "<div mdtype='toc'><div>", '[toc]', !0, clipboardEvent), !0;
        if ('IMG' == domNode.tagName)
          return (
            w(domNode.outerHTML, null, domNode.getAttribute('src') || '', !0, clipboardEvent), !0
          );
        if (element.attr('mdtype') === NodeType.math_block && (!range || range.collapsed)) {
          var mathSource = editorInstance.mathBlock.getTex(element.attr('cid'));
          return (
            w(
              (domNode.querySelector('.MathJax_Display') || {}).outerHTML || '',
              "<div mdtype='" + NodeType.math_block + "'>" + mathSource + '</div>',
              mathSource,
              !0,
              clipboardEvent,
            ),
            !0
          );
        }
        if (element.attr('mdtype') === NodeType.html_block && (!range || range.collapsed)) {
          var documentNode = editorInstance.getNode(element.attr('cid')),
            text = documentNode.get('text');
          return (
            w(
              text,
              "<div mdtype='" +
                NodeType.html_block +
                "' data-tag='" +
                utilities.escape(documentNode.get('style')) +
                "'>" +
                utilities.escape(text) +
                '</div>',
              text,
              !0,
              clipboardEvent,
            ),
            !0
          );
        }
        if (range) {
          if (
            range.startContainer &&
            range.startContainer.parentElement &&
            range.startContainer.parentElement.closest('.marklyra-table-edit')
          ) {
            var firstCellSpan = element.closest('table').find('.td-span')[0];
            firstCellSpan &&
              (range.setStart(firstCellSpan, 0), editorInstance.selection.setRange(range, !0));
          }
          var lineWiseCopy = clipboardEvent && range.collapsed && File.option.lineWiseCopyCut;
          if (
            (!File._CopyContentRange &&
              lineWiseCopy &&
              (File._CopyContentFlag ||
                ((document.querySelector('#no-sel-style').innerHTML =
                  '::selection {\n\t\t\t\t\tbackground: transparent;\n\t\t\t\t\ttext-shadow: none;\n\t\t\t\t\tcolor: inherit;\n\t\t\t\t}'),
                setTimeout(() => {
                  File._CopyContentRange &&
                    ((editorInstance.selection.getRangy() || {}).collapsed ||
                      (document.querySelector('#no-sel-style').innerHTML = ''));
                }, 1e3)),
              editorInstance.selection.selectLineWrap()),
            File._CopyContentRange &&
              setTimeout(() => {
                editorInstance.selection.setRange(File._CopyContentRange),
                  (File._CopyContentRange = null),
                  (document.querySelector('#no-sel-style').innerHTML = '');
              }, 0),
            !range.collapsed || lineWiseCopy)
          ) {
            if (!File._CopyContentFlag && File.isNode)
              return (
                (File._CopyContentFlag = !0),
                lineWiseCopy && (File._CopyContentRange = range),
                electron.clipboard.clear(),
                JSBridge.invoke('webContents.copy'),
                !1
              );
            if ('cut_before' === File._CopyContentFlag && lineWiseCopy)
              return void (editorInstance.selection.isSameRange(File._CopyContentRange, range)
                ? ((File._CopyContentRange = null), (File._CopyContentFlag = !1))
                : ((File._CopyContentRange = range), JSBridge.invoke('webContents.copy')));
            lineWiseCopy &&
              File.isMac &&
              ((File._CopyContentRange = range), (range = editorInstance.selection.getRangy()));
            var selectedHtml = '';
            if (lineWiseCopy || File._CopyContentRange) {
              let currentDomNode = editorInstance.findElemById(editorInstance.focusCid)[0],
                selectionBookmark = range.getBookmark(currentDomNode || void 0);
              range.commonAncestorContainer != currentDomNode &&
              range.commonAncestorContainer.contains(currentDomNode)
                ? (selectedHtml = range.toHtml() + '<br/>')
                : 0 === selectionBookmark.start &&
                    selectionBookmark.end >= currentDomNode.textContent.length
                  ? ((selectedHtml = currentDomNode.outerHTML + "<p mdtype='paragraph'></p>"),
                    currentDomNode.previousElementSibling ||
                      (currentDomNode.previousElementSibling &&
                        'INPUT' != currentDomNode.previousElementSibling.tagName) ||
                      ('LI' == currentDomNode.parentElement.tagName
                        ? (selectedHtml =
                            currentDomNode.parentElement.outerHTML + "<li mdtype='list_item'></li>")
                        : DocumentNode.isType(currentDomNode.parentElement.tagName, 'BLOCKQUOTE') &&
                          (selectedHtml =
                            currentDomNode.parentElement.outerHTML + "<p mdtype='paragraph'></p>")))
                  : (selectedHtml = range.toHtml() + '<br/>');
            } else
              editorInstance.selection.includeTrailMeta(range), (selectedHtml = range.toHtml());
            var markHtml = htmlParser
                .getMarkElemFromCurrentHtml(selectedHtml, editorInstance)
                .html(),
              plainText = File.option.copyMarkdownByDefault
                ? A(markHtml)
                : T(markHtml).replace(/\u200B/gi, '');
            return (
              clipboardEvent && File.isMac
                ? setTimeout(function () {
                    w(null, markHtml, plainText, !1, clipboardEvent),
                      bridge.callHandler('clipboard.postCopy', lineWiseCopy ? void 0 : afterCopy),
                      lineWiseCopy &&
                        (afterCopy && afterCopy(),
                        'copy' == clipboardEvent.type
                          ? (editorInstance.selection.setRange(File._CopyContentRange),
                            (document.querySelector('#no-sel-style').innerHTML = ''))
                          : setTimeout(function () {
                              document.querySelector('#no-sel-style').innerHTML = '';
                            }, 30),
                        (File._CopyContentRange = null));
                  }, 0)
                : w(null, markHtml, plainText, !1, clipboardEvent),
              !1
            );
          }
        }
      }),
      (moduleExports.insertInlineText = b),
      (moduleExports.pasteHandler = L),
      (moduleExports.setClipboard = w),
      (moduleExports.prepMarkHtml = function (htmlContent, editorInstance) {
        return htmlParser.getMarkElemFromCurrentHtml(htmlContent, editorInstance);
      }),
      (moduleExports.insertParagraph = function (insertBefore, editorInstance, targetElement) {
        if (!File.isNode || !File.isLocked) {
          (editorInstance = editorInstance || File.editor),
            (targetElement = targetElement || editorInstance.getMarkElem()),
            editorInstance.undo.endSnap(!0);
          var documentNode = editorInstance.findNodeByElem(targetElement),
            documentNodeInstance = new DocumentNode({ type: NodeType.paragraph, text: '' }),
            insertCommand = undoManager.makeEmptyCommand(
              editorInstance.selection.buildUndo(void 0, targetElement),
            );
          documentNode &&
            ((documentNode = documentNode.getClosetBlock()),
            insertBefore
              ? (documentNode.addBefore(documentNodeInstance),
                editorInstance.findElemById(documentNode.cid).before(documentNodeInstance.toHTML()))
              : (documentNode.addAfter(documentNodeInstance),
                editorInstance.findElemById(documentNode.cid).after(documentNodeInstance.toHTML())),
            undoManager.addUndoForInsert(insertCommand, documentNodeInstance),
            editorInstance.selection.jumpIntoElemBegin(
              editorInstance.findElemById(documentNodeInstance.cid),
            ),
            insertCommand.redo.push(editorInstance.selection.buildUndo()),
            editorInstance.undo.register(insertCommand),
            editorInstance.refocus(),
            window.Reporter.fullValidate());
        }
      }),
      (moduleExports.insertDom = function (domContent) {
        File.editor.focusAndRestorePos(), L(File.editor, $('<div>').append(domContent).html(), !1);
      }),
      (moduleExports.processClipboardHTML = E),
      (moduleExports.beforeCopyStart = function (editorInstance) {
        (savedCopyRange = null),
          File.isMac &&
            (document.body.classList.add('marklyra-on-copy'),
            (savedCopyRange = !0),
            setTimeout(() => {
              D(editorInstance);
            }, 1));
      }),
      (moduleExports.getSpeechText = function (inputEditor) {
        if ((inputEditor = File.editor).sourceView.inSourceMode)
          return inputEditor.sourceView.cm.getSelection() || inputEditor.sourceView.cm.getValue();
        var selectionRange = inputEditor.selection.getRangy();
        if (!selectionRange || selectionRange.collapsed) {
          var documentElements = $('#write').children(),
            lastElement = documentElements.last()[0];
          selectionRange = inputEditor.selection.createRange(
            documentElements.first()[0],
            0,
            lastElement,
            lastElement.childNodes.length,
          );
        }
        return T(
          htmlParser.getMarkElemFromCurrentHtml(selectionRange.toHtml(), inputEditor).html(),
        );
      });
  },
);
