// editing/clipboard.
export default function initializeEditingClipboard(requireModule, moduleExports, moduleRecord) {
  'use strict';
  Object.defineProperty(serializeClipboardHtml, 'name', { value: 'C', configurable: true });
  Object.defineProperty(markupToPlainText, 'name', { value: 'T', configurable: true });
  Object.defineProperty(parseMarkdownHtml, 'name', { value: '_', configurable: true });
  Object.defineProperty(markupToMarkdown, 'name', { value: 'A', configurable: true });

  if (!this) {
    self;
  }
  var utilities = requireModule('shared/utilities'),
    documentModel = requireModule('model/document-model'),
    undoManager = requireModule('editing/undo-manager'),
    DocumentNode = documentModel.Node,
    NodeType = documentModel.TYPE,
    nodeCollectionUtilities = documentModel.NodeCollectionUtils,
    markdownParser = (requireModule('libraries/rangy'), requireModule('model/markdown-parser')),
    tableEditor = requireModule('editing/table-editor'),
    htmlParser = requireModule('model/html-parser'),
    formatting = requireModule('editing/formatting'),
    htmlBlocks = (requireModule('editing/emoji'), requireModule('render/html-blocks')),
    deletion = (requireModule('host/file-integration'), requireModule('editing/deletion')),
    mediaActions = requireModule('media/actions'),
    electron = window.reqnode ? reqnode('electron') : null,
    backspaceHandler = deletion.backspaceHandler,
    isEmptyPasteTarget = Object.defineProperty(
      function (documentNode) {
        return (
          DocumentNode.isEmptyBlock(documentNode) ||
          (DocumentNode.isType(documentNode, NodeType.list_item) &&
            1 == documentNode.get('children').length &&
            DocumentNode.isEmptyBlock(documentNode.getFirstChild()))
        );
      },
      'name',
      { value: 'y', configurable: true },
    ),
    insertInlineText = Object.defineProperty(
      function (editorInstance, targetNode, text, insertionOffset, insertCommand, restoreCursor) {
        console.debug('insertInlineText');
        if (
          (targetNode =
            targetNode ||
            ((nodeElement = editorInstance.getMarkElem()),
            editorInstance.getNode(nodeElement.attr('cid'))))
        ) {
          var element = editorInstance.getJQueryElem(window.getSelection().anchorNode),
            nodeElement = editorInstance.findElemById(targetNode.id);
          if (DocumentNode.noChangeLine(targetNode)) {
            text = text.trim().split(/[\n\r]+/gi)[0];
          }
          if ('\n' == text && nodeElement.text().length <= insertionOffset) {
            text = '\n​';
          }
          if (insertCommand) {
            insertCommand.undo.push(undoManager.buildReplaceUndo(targetNode, void 0));
          }
          var elementLength = element.closest('.md-def-link, .md-def-footnote').length,
            currentText = '';
          if (elementLength && element.hasClass('md-def-name')) {
            nodeElement = element.closest('[cid]');
            editorInstance.selection
              .getRangy()
              .insertNode(document.createTextNode(utilities.escape(text)));
            targetNode.set('ref', element.text());
          } else {
            if (elementLength && element.hasClass('md-def-url')) {
              nodeElement = element.closest('[cid]');
              text = text.replace(/\s/gi, '');
              editorInstance.selection
                .getRangy()
                .insertNode(document.createTextNode(utilities.escape(text)));
              targetNode.set('href', element.text());
            } else {
              if (elementLength && element.hasClass('md-def-title')) {
                nodeElement = element.closest('[cid]');
                editorInstance.selection
                  .getRangy()
                  .insertNode(document.createTextNode(utilities.escape(text)));
                targetNode.set('title', element.text());
              } else {
                var localText,
                  endOffset = insertionOffset;
                if (
                  element.hasClass('md-meta-block') &&
                  0 == element.text().length &&
                  '\n​' == text
                ) {
                  localText = '\n\n';
                } else {
                  if (
                    element.hasClass('md-meta-block') &&
                    currentText.length == insertionOffset &&
                    '\n' == currentText[insertionOffset - 1]
                  ) {
                    insertionOffset--;
                  } else {
                    if (elementLength && element.closest('.md-def-content').length) {
                      endOffset -= (targetNode.get('ref') || '').length + 1;
                      currentText = element.closest('.md-def-content').rawText();
                    } else {
                      currentText = nodeElement.rawText();
                      if (DocumentNode.isType(targetNode, NodeType.meta_block)) {
                        currentText = currentText.replace(/\n$/, '');
                      }
                    }
                  }
                  if (element.hasClass('md-meta-block') && '\t' == text) {
                    var textSlice = currentText.substring(0, endOffset);
                    if (!(textSlice && !/\n\s*$/.exec(textSlice))) {
                      text = ' '.repeat(File.option.indentSize);
                    }
                  }
                  localText =
                    void 0 !== endOffset
                      ? currentText.substring(0, endOffset) +
                        text +
                        currentText.substring(endOffset)
                      : currentText.text() + text;
                }
                targetNode.set('text', localText.replace(/\u200B/g, ''));
                nodeElement.html(
                  $(
                    markdownParser.renderHtmlWithBlockMeta(targetNode, editorInstance.brush),
                  ).html(),
                );
              }
            }
          }
          if (insertCommand) {
            editorInstance.store(targetNode, true);
            insertCommand.redo.push(undoManager.buildReplaceUndo(targetNode, void 0));
          }
          var cursorSnapshot = {
            id: targetNode.id,
            type: 'cursor',
            start: insertionOffset + text.length,
          };
          nodeElement = editorInstance.findElemById(targetNode.id);
          if (restoreCursor) {
            var match = currentText.match(/\u200b:|:\u200b/);
            if (!match) {
              nodeElement.find('.md-emoji-control-ch').text('');
            }
            editorInstance.undo.exeCommand(cursorSnapshot);
            if (!match) {
              nodeElement.find('.md-emoji-control-ch').text('​');
            }
            editorInstance.brush.addToQueue(targetNode.id);
            cursorSnapshot = editorInstance.selection.buildUndo();
          }
          if (insertCommand) {
            insertCommand.redo.push(cursorSnapshot);
          }
          editorInstance.brush.addToQueue(targetNode.id);
          if (restoreCursor) {
            nodeElement.addClass('md-focus');
          }
          if (nodeElement.length) {
            editorInstance.refreshUnder(nodeElement[0]);
          }
        }
      },
      'name',
      { value: 'b', configurable: true },
    ),
    writeClipboardFormats = Object.defineProperty(
      function (htmlContent, textSlice, text, clearMissingFormats, event) {
        if (File.isMac) {
          !(function (htmlContent, markHtml, plainText, clearMissingFormats) {
            var clipboardFormats = {};
            if (utilities.isDefined(htmlContent)) {
              clipboardFormats['text/html'] = extractClipboardContent(htmlContent)[0];
            }
            if (utilities.isDefined(markHtml)) {
              clipboardFormats['text/markhtml'] = markHtml;
            }
            if (utilities.isDefined(plainText)) {
              clipboardFormats['text/plain'] = plainText;
            }
            JSBridge.clipboard.writeForMac(clipboardFormats, clearMissingFormats);
          })(htmlContent, textSlice, text, clearMissingFormats);
        } else {
          if (File.isNode) {
            if (event) {
              if ('cut_before' === File._CopyContentFlag || ('cut' == event.type && htmlContent)) {
                if (!htmlContent) {
                  JSBridge.invoke('webContents.copy');
                  return void (File._CopyContentFlag = 'cut_after');
                }
                backspaceHandler(File.editor, null, 'delSelection');
                File._CopyContentFlag = false;
              } else {
                if ('cut_after' === File._CopyContentFlag) {
                  File._CopyContentFlag = false;
                  htmlContent = (extractClipboardContent(electron.clipboard.readHTML()) || [])[0];
                  let selectionSnapshot =
                      File._CopyContentRange && editor.selection.buildUndo(File._CopyContentRange),
                    cutCommand = backspaceHandler(File.editor, null, 'delSelection', true);
                  if (File._CopyContentRange) {
                    if (cutCommand) {
                      cutCommand.undo.unshift(selectionSnapshot);
                      let cleanupCommand = backspaceHandler(editor, null, true, true);
                      if (cleanupCommand) {
                        undoManager.append(cutCommand, cleanupCommand);
                      }
                    } else {
                      backspaceHandler(editor, null, true);
                    }
                    File._CopyContentRange = null;
                  }
                  editor.undo.register(cutCommand);
                } else {
                  if (htmlContent && !File._CopyContentFlag) {
                  } else {
                    if (!File._CopyContentFlag) {
                      File._CopyContentFlag = true;
                      return void (!htmlContent && JSBridge.invoke('webContents.copy'));
                    }
                    if (
                      !(
                        true !== File._CopyContentFlag ||
                        (null !== htmlContent && void 0 != htmlContent) ||
                        (htmlContent =
                          (extractClipboardContent(electron.clipboard.readHTML() || htmlContent) ||
                            [])[0] || '')
                      )
                    ) {
                      console.debug('failed to read html from clipboard');
                    }
                    if (!textSlice && /^markhtml\|/.exec(File._CopyContentFlag + '')) {
                      textSlice = File._CopyContentFlag.substring('markhtml|'.length);
                    }
                    File._CopyContentFlag = false;
                  }
                }
              }
              !(function (htmlContent, markHtml, plainText, clearMissingFormats, clipboardEvent) {
                if (null != plainText) {
                  clipboardEvent.clipboardData.setData('text/plain', plainText);
                } else {
                  if (clearMissingFormats) {
                    clipboardEvent.clipboardData.setData('text/plain', '');
                  }
                }
                if (null != htmlContent) {
                  clipboardEvent.clipboardData.setData('text/html', htmlContent);
                } else {
                  if (clearMissingFormats) {
                    clipboardEvent.clipboardData.setData('text/html', '');
                  }
                }
                if (null != markHtml) {
                  clipboardEvent.clipboardData.setData('text/markhtml', markHtml);
                } else {
                  if (clearMissingFormats) {
                    clipboardEvent.clipboardData.setData('text/markhtml', '');
                  }
                }
              })(htmlContent, textSlice, text, clearMissingFormats, event);
              event.preventDefault();
            } else {
              JSBridge.invoke(
                'clipboard.write',
                JSON.stringify({
                  html: extractClipboardContent(htmlContent)[0] || text,
                  text: text,
                }),
                clearMissingFormats || false,
              );
              if (textSlice) {
                File._CopyContentFlag = 'markhtml|' + textSlice;
                JSBridge.invoke('webContents.copy');
              } else {
                File._CopyContentFlag = false;
              }
            }
          }
        }
      },
      'name',
      { value: 'w', configurable: true },
    ),
    copySelection = Object.defineProperty(
      function (editorInstance, clipboardEvent, copyAsPlainText) {
        editorInstance = editorInstance || File.editor;
        var activeElement = document.activeElement,
          range = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode) {
          writeClipboardFormats(
            null,
            null,
            File.editor.sourceView.cm.getSelection(),
            true,
            clipboardEvent,
          );
        } else {
          if ('HR' == activeElement.getAttribute('mdtype')) {
            writeClipboardFormats(null, null, '---', true, clipboardEvent);
          } else {
            if (
              activeElement.getAttribute('mdtype') !== NodeType.math_block ||
              (range && !range.collapsed)
            ) {
              if (isInputComponent(activeElement) || void 0 !== activeElement.tabindex) {
                writeClipboardFormats(
                  null,
                  null,
                  activeElement.value || activeElement.textContent,
                  true,
                  clipboardEvent,
                );
              } else {
                if (window.getSelection().rangeCount) {
                  var element, markHtml;
                  if (range.collapsed) {
                    element = (element = $(range.startContainer).closest('.md-table-fig')).length
                      ? htmlParser.getMarkElemFromCurrentHtml(element[0].outerHTML, editorInstance)
                      : null;
                  }
                  if (!element) {
                    element = htmlParser.getMarkElemFromCurrentHtml(range.toHtml(), editorInstance);
                  }
                  markHtml = element.html();
                  writeClipboardFormats(
                    null,
                    copyAsPlainText ? null : markHtml,
                    copyAsPlainText
                      ? markupToPlainText(markHtml).replace(/\u200B/gi, '')
                      : markupToMarkdown(markHtml),
                    true,
                    clipboardEvent,
                  );
                }
              }
            } else {
              writeClipboardFormats(
                null,
                null,
                '$$\n' +
                  editorInstance.mathBlock.getTex(activeElement.getAttribute('cid')) +
                  '\n$$',
                true,
                clipboardEvent,
              );
            }
          }
        }
        File._CopyContentFlag = false;
      },
      'name',
      { value: 'x', configurable: true },
    );
  function serializeClipboardHtml(htmlContent, editorInstance, prettyForRendering) {
    var markHtml,
      parsedBlocks = parseMarkdownHtml(
        (markHtml = htmlParser.getMarkElemFromCurrentHtml(htmlContent, editorInstance).html()),
        void 0,
        void 0,
        void 0,
        true,
      );
    return [
      editorInstance.export.exportCollection(parsedBlocks, null, {
        forPrint: false,
        noStyle: true,
        exportFooter: true,
        prettyForRendering: prettyForRendering,
        split: '\n',
      }),
      markHtml,
      File.option.copyMarkdownByDefault ? markupToMarkdown(markHtml) : markupToPlainText(markHtml),
    ];
  }
  var copyAsPlainText = Object.defineProperty(
      function (editorInstance, clipboardEvent) {
        copySelection(editorInstance, clipboardEvent, true);
      },
      'name',
      { value: 'F', configurable: true },
    ),
    copyAsMarkdown = Object.defineProperty(
      function (editorInstance, clipboardEvent) {
        editorInstance = editorInstance || File.editor;
        var activeElement = document.activeElement,
          selectionRange = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode) {
          writeClipboardFormats(
            null,
            null,
            File.editor.sourceView.cm.getSelection(),
            true,
            clipboardEvent,
          );
        } else {
          if ('HR' == activeElement.getAttribute('mdtype')) {
            writeClipboardFormats(null, null, '<hr/>', true, clipboardEvent);
          } else {
            if (
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
                    var exportedHtml = serializeClipboardHtml(
                      element[0].outerHTML,
                      editorInstance,
                    )[0];
                    return void writeClipboardFormats(
                      null,
                      "<pre mdtype='fences' lang='HTML'>" +
                        utilities.escape(exportedHtml) +
                        '</pre>',
                      exportedHtml,
                      true,
                      clipboardEvent,
                    );
                  }
                }
                writeClipboardFormats(
                  null,
                  null,
                  activeElement.value || activeElement.textContent,
                  true,
                  clipboardEvent,
                );
              } else {
                if (window.getSelection().rangeCount) {
                  exportedHtml = serializeClipboardHtml(selectionRange.toHtml(), editorInstance)[0];
                  writeClipboardFormats(
                    null,
                    "<pre mdtype='fences' lang='HTML'>" + utilities.escape(exportedHtml) + '</pre>',
                    exportedHtml,
                    true,
                    clipboardEvent,
                  );
                }
              }
            } else {
              writeClipboardFormats(
                null,
                null,
                '$$\n' +
                  editorInstance.mathBlock.getTex(activeElement.getAttribute('cid')) +
                  '\n$$',
                true,
                clipboardEvent,
              );
            }
          }
        }
      },
      'name',
      { value: 'S', configurable: true },
    ),
    cutSelection = Object.defineProperty(
      function (editorInstance, clipboardEvent) {
        editorInstance = editorInstance || File.editor;
        var nodeId,
          clipboardFormats,
          activeElement = document.activeElement,
          selectionRange = editorInstance.selection.getRangy();
        if (editorInstance.sourceView.inSourceMode) {
          writeClipboardFormats(
            null,
            null,
            File.editor.sourceView.cm.getSelection(),
            true,
            clipboardEvent,
          );
        } else {
          if ('HR' == activeElement.getAttribute('mdtype')) {
            var documentNode = editorInstance.getNode(activeElement.getAttribute('cid'));
            writeClipboardFormats('<hr/>', null, documentNode.get('text'), true, clipboardEvent);
          } else {
            if (
              activeElement.getAttribute('mdtype') !== NodeType.math_block ||
              (selectionRange && !selectionRange.collapsed)
            ) {
              if (isInputComponent(activeElement) || 0 == activeElement.childElementCount) {
                if (activeElement.classList.contains('md-content')) {
                  if (selectionRange.toString() == activeElement.textContent) {
                    if ($(activeElement).closest('.md-image').length) {
                      clipboardFormats = serializeClipboardHtml(
                        selectionRange.toHtml(),
                        editorInstance,
                        true,
                      );
                      return void writeClipboardFormats(
                        clipboardFormats[0],
                        clipboardFormats[1],
                        clipboardFormats[2],
                        true,
                        clipboardEvent,
                      );
                    }
                  }
                }
                writeClipboardFormats(
                  activeElement.value || activeElement.textContent,
                  null,
                  activeElement.value || activeElement.textContent,
                  true,
                  clipboardEvent,
                );
              } else {
                if (window.getSelection().rangeCount) {
                  clipboardFormats = serializeClipboardHtml(
                    selectionRange.toHtml(),
                    editorInstance,
                    true,
                  );
                  writeClipboardFormats(
                    clipboardFormats[0],
                    clipboardFormats[1],
                    clipboardFormats[2],
                    true,
                    clipboardEvent,
                  );
                }
              }
            } else {
              nodeId = activeElement.getAttribute('cid');
              var currentDocumentNode = editorInstance.getNode(nodeId);
              writeClipboardFormats(
                editorInstance.export.getSVGForExport(currentDocumentNode, false),
                '$$\n' + editorInstance.mathBlock.getTex(nodeId) + '\n$$',
                '$$\n' + editorInstance.mathBlock.getTex(nodeId) + '\n$$',
                true,
                clipboardEvent,
              );
            }
          }
        }
      },
      'name',
      { value: 'k', configurable: true },
    ),
    extractClipboardContent = Object.defineProperty(
      function (htmlContent) {
        if (!htmlContent) {
          return ['', ''];
        }
        if (
          File.isMac &&
          (htmlContent.match(/<\/p>/g) || []).length - (htmlContent.match(/<p/g) || []).length == 1
        ) {
          htmlContent = '<p>' + htmlContent;
        }
        var parsedNodes = $.parseHTML('<div>' + htmlContent + '</div>'),
          cleanHtml = '<!DOCTYPE html>',
          spacedHtml = '<!DOCTYPE html>',
          linePrefix = File.option.showLineNumbersForFence ? '&nbsp;' : '';
        if (!parsedNodes.length) {
          return ['', ''];
        }
        var clipboardElement = $(parsedNodes[0]),
          elements = clipboardElement.find('.md-emoji');
        elements.text(function (emojiIndex) {
          return $(elements[emojiIndex]).children('[data-emoji]').attr('data-emoji');
        });
        clipboardElement.find('.md-pants').text(function () {
          return this.dataset.content;
        });
        clipboardElement
          .find(
            '.marklyra-table-edit, .md-meta, .md-content, .md-rawblock-tooltip, .md-tooltip-hide, span p, .md-meta-none, .md-reverse-footnote-area',
          )
          .remove();
        clipboardElement.find('[cid].md-fences').html(function () {
          var fenceElement = $(this);
          fenceElement.children('[cid]').each(function () {
            fenceElement.after(this);
          });
          fenceElement[0].style.whiteSpace = 'pre';
          var currentElements = this.querySelectorAll('pre.CodeMirror-line');
          if (currentElements.length) {
            for (
              var textParts = [], itemIndex = 0;
              itemIndex < currentElements.length;
              itemIndex++
            ) {
              if (currentElements[itemIndex].innerHTML) {
                textParts.push(linePrefix + currentElements[itemIndex].innerHTML);
              }
            }
            return textParts.join('<br/>');
          }
          return this.innerHTML;
        });
        clipboardElement
          .find('p, h1, h2, h3, h4, h5, h6, .md-def-link, .md-def-footnoote')
          .css('width', '');
        clipboardElement.find('.md-br').text('\n');
        clipboardElement.find('.md-def-name').before('[').after(']   ');
        clipboardElement.find('.task-list-item > p').replaceWith(function () {
          return (
            (this.previousElementSibling && 'INPUT' == this.previousElementSibling.tagName
              ? ' '
              : '') +
            this.innerHTML +
            (this.nextSibling ? '\n' : '')
          );
        });
        clipboardElement.find('.md-entity').text(function () {
          return this.dataset.content;
        });
        clipboardElement.find('[contenteditable]').removeAttr('contenteditable');
        var searchValue = location.href.replace(/[^\/\\]+.html/, '');
        clipboardElement.find('a').attr('href', function (unusedParameter1, text) {
          if (text && 0 == text.indexOf(location.href)) {
            return text.substr(location.href.length);
          } else {
            if (text && 0 == text.indexOf(searchValue)) {
              return text.substr(searchValue.length);
            } else {
              return text;
            }
          }
        });
        clipboardElement.find('img[data-real-src]').attr('src', function () {
          return this.dataset.realSrc;
        });
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
          .after('<br />');
        clipboardElement.find('.md-inline-math').text(function () {
          var elementId = this.getAttribute('id'),
            element = document.querySelector('#' + elementId);
          return (element && (element.querySelector('script') || {}).innerText) || '';
        });
        clipboardElement.find('[style]').attr('style', function (unusedParameter1, styleText) {
          return (styleText || '').replace(/\s--[^;]+;/g, '');
        });
        cleanHtml += clipboardElement.html();
        clipboardElement.find('.md-toc').remove();
        clipboardElement.find('li p').replaceWith(function () {
          return this.innerHTML + (this.nextSibling ? '\n' : '');
        });
        clipboardElement
          .find(
            'ul, ol, .md-def-link, .md-toc, .md-def-footnoote, blockquote, .md-fences, .mathjax-block',
          )
          .after('<br/><br/>');
        clipboardElement.find('.md-def-name').before('[').after(']   ');
        return [cleanHtml, (spacedHtml += clipboardElement.html())];
      },
      'name',
      { value: 'E', configurable: true },
    );
  function markupToPlainText(markHtml) {
    var parsedBlocks = htmlParser.getBlocksFromMarkHtml(markHtml, null, true);
    if ('string' == typeof parsedBlocks) {
      return parsedBlocks;
    } else {
      return htmlParser.convertToPlain(parsedBlocks);
    }
  }
  function parseMarkdownHtml(
    markHtml,
    nodeMap,
    unusedParameter3,
    unusedParameter4,
    preserveDomIdentity,
  ) {
    return htmlParser.getBlocksFromMarkHtml(markHtml, nodeMap, false, preserveDomIdentity);
  }
  function markupToMarkdown(markHtml) {
    var parsedBlocks = parseMarkdownHtml(markHtml, void 0, 0, 0, true);
    if ('string' == typeof parsedBlocks) {
      return parsedBlocks;
    } else {
      return DocumentNode.markFromArr(parsedBlocks);
    }
  }
  var savedCopyRange,
    pasteContent = Object.defineProperty(
      function (editorInstance, pasteInput, pasteAsPlainText, selectionRestoreOverride) {
        Object.defineProperty(readNodeAttributes, 'name', { value: 'L', configurable: true });
        Object.defineProperty(readNodeText, 'name', { value: 'D', configurable: true });
        Object.defineProperty(restorePasteSelection, 'name', { value: 'R', configurable: true });
        Object.defineProperty(insertParsedContent, 'name', { value: 'B', configurable: true });
        Object.defineProperty(mergePasteNodes, 'name', { value: 'P', configurable: true });
        Object.defineProperty(pasteText, 'name', { value: 'I', configurable: true });
        Object.defineProperty(pasteBlocks, 'name', { value: 'O', configurable: true });
        Object.defineProperty(replaceSelectionWithPaste, 'name', {
          value: 'H',
          configurable: true,
        });

        var remap,
          clipboardBaseUrl = '';
        File._PasteContentFlag = false;
        if ((editorInstance = editorInstance || File.editor)) {
          if ('function' == typeof selectionRestoreOverride) {
            restorePasteSelection = selectionRestoreOverride;
          }
          var markhtml,
            html = 'string' != typeof pasteInput || pasteAsPlainText ? null : pasteInput,
            currentText = 'string' == typeof pasteInput && pasteAsPlainText ? pasteInput : null,
            event = 'object' == typeof pasteInput ? pasteInput : null;
          if (event && event.commonHtml) {
            html = event.commonHtml;
            event = null;
          } else {
            if (event && event.markhtml) {
              markhtml = event.markhtml;
              event = null;
            }
          }
          if (
            'INPUT' == document.activeElement.tagName ||
            (document.activeElement.classList &&
              document.activeElement.classList.contains('marklyra-input'))
          ) {
            return true;
          }
          if ('TEXTAREA' == document.activeElement.tagName) {
            console.debug('pasteHandler: focused in input element');
            if (!event && currentText) {
              var element = $(document.activeElement).closest('.CodeMirror');
              if (element) {
                (element = element[0].CodeMirror).replaceSelection(currentText);
              }
            }
            return true;
          }
          if (DocumentNode.isType(targetNode, NodeType.hr)) {
            return false;
          }
          if ('BODY' == document.activeElement.tagName) {
            return false;
          }
          var range,
            start,
            pasteCommand =
              editorInstance.UserOp.backspaceHandler(
                editorInstance,
                null,
                'delSelection',
                true,
                false,
              ) || undoManager.makeEmptyCommand(),
            targetElement = editorInstance.getMarkElem(),
            targetNode = editorInstance.findNodeByElem(targetElement),
            clipboardContent = { markhtml: markhtml, html: html, text: currentText };
          if (event) {
            event.preventDefault();
            JSBridge.clipboard.read(event, clipboardContent).then(replaceSelectionWithPaste);
          } else {
            if (clipboardContent.html || clipboardContent.text || clipboardContent.markhtml) {
              replaceSelectionWithPaste(clipboardContent);
            } else {
              JSBridge.clipboard.read(null, clipboardContent).then(replaceSelectionWithPaste);
            }
          }
        }
        function readNodeAttributes(documentNode, unusedParameter2) {
          if (documentNode.get('attr') && documentNode.get('attr').trim().length) {
            return documentNode.get('attr');
          } else {
            return void 0;
          }
        }
        function readNodeText(documentNode) {
          if (
            DocumentNode.isType(
              documentNode,
              DocumentNode.TYPE.paragraph,
              DocumentNode.TYPE.heading,
              DocumentNode.TYPE.raw_edit,
              DocumentNode.TYPE.fences,
              DocumentNode.TYPE.table_cell,
            )
          ) {
            return documentNode.get('text');
          } else {
            if (
              (!DocumentNode.isType(documentNode, NodeType.def_footnote) ||
                (readNodeAttributes(documentNode) && readNodeAttributes(documentNode))) &&
              (!DocumentNode.isType(documentNode, NodeType.def_link) ||
                (readNodeAttributes(documentNode) && readNodeAttributes(documentNode)))
            ) {
              return documentNode
                .get('children')
                .toArray()
                .reduce(function (accumulatedText, childNode) {
                  return accumulatedText + readNodeText(childNode);
                }, ' ');
            } else {
              return (
                readNodeAttributes(blocks[0]) ||
                readNodeAttributes(blocks[0]) ||
                readNodeAttributes(blocks[0]) ||
                readNodeAttributes(blocks[0]) ||
                ''
              );
            }
          }
        }
        function restorePasteSelection(
          nodeId,
          startOffset,
          inputNodeId,
          endOffset,
          unusedParameter5,
        ) {
          if (!selectionRestoreOverride) {
            try {
              var selectionRange = editorInstance.selection.restoreEdge(
                editorInstance.findElemById(nodeId),
                startOffset,
              );
              if (void 0 !== endOffset) {
                selectionRange = editorInstance.selection.restoreEdge(
                  editorInstance.findElemById(inputNodeId),
                  endOffset,
                  true,
                  selectionRange,
                );
              } else {
                selectionRange.setEndAfter(
                  editorInstance.findElemById(inputNodeId)[0] ||
                    editorInstance.findElemById(nodeId)[0],
                );
              }
              editorInstance.imgEdit.tryMoveImageInRange(selectionRange, true);
              editorInstance.stylize.putBookmark(
                null,
                editorInstance.stylize.buildBookmark(editorInstance.findElemById(inputNodeId)),
              );
              $(editorInstance.sessionStr).trigger('cursorChange', editorInstance.styleBookmark);
            } catch (error) {
              console.error(error);
            }
          }
        }
        function insertParsedContent(
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
          if ('string' == typeof items) {
            return pasteText(
              callbackDocumentNode,
              insertionOffset,
              items || fallbackText || '',
              pasteCommand,
              true,
            );
          }
          if (1 == items.length && insertionOffset) {
            let inlineText = Object.defineProperty(
              function readSingleChildText(documentNode) {
                var childrenLength = documentNode.get('children').length;
                if (childrenLength) {
                  if (1 == childrenLength) {
                    return readSingleChildText(documentNode.getFirstChild());
                  } else {
                    return '\n\n\n';
                  }
                } else {
                  return documentNode.get('text') || '';
                }
              },
              'name',
              { value: 'e', configurable: true },
            )(items[0]);
            if (-1 == inlineText.indexOf('\n')) {
              return pasteText(callbackDocumentNode, insertionOffset, inlineText, pasteCommand);
            }
          } else {
            if (0 == items.length) {
              return;
            }
          }
          if (DocumentNode.isType(callbackDocumentNode, NodeType.table_cell)) {
            !(function (targetCell, insertionOffset, inputItems, pasteCommand) {
              Object.defineProperty(insertTableCellText, 'name', {
                value: 'c',
                configurable: true,
              });

              var TableEdit = editorInstance.tableEdit.TableEdit;
              function insertTableCellText(
                targetCell,
                substringLength,
                sourceNode,
                unusedParameter4,
              ) {
                var text = targetCell.safeGetStrAttr('text'),
                  insertedText = readNodeText(sourceNode).replace(/\r?\n/g, ' ');
                targetCell.set(
                  'text',
                  text.substr(0, substringLength) + insertedText + text.substr(substringLength),
                );
                return substringLength + insertedText.length;
              }
              var cursorOffset,
                parentNode = targetCell.get('parent').get('parent'),
                currentCell = targetCell,
                lastCell = currentCell;
              pasteCommand.undo.push(undoManager.buildReplaceUndo(parentNode));
              var currentItems = [],
                sourceRows = [];
              inputItems.forEach(function (sourceNode, unusedParameter2) {
                if (sourceNode.get('type') == NodeType.table) {
                  sourceRows = sourceRows.concat(
                    (function (documentNode) {
                      Object.defineProperty(collectChildNodes, 'name', {
                        value: 't',
                        configurable: true,
                      });

                      function collectChildNodes(inputDocumentNode) {
                        for (
                          var currentDocumentNode = inputDocumentNode.getFirstChild(),
                            localItems = [];
                          currentDocumentNode;
                        ) {
                          localItems.push(currentDocumentNode);
                          currentDocumentNode = currentDocumentNode.get('after');
                        }
                        return localItems;
                      }
                      for (
                        var tableRows = [], localDocumentNode = documentNode.getFirstChild();
                        localDocumentNode;
                      ) {
                        tableRows.push(collectChildNodes(localDocumentNode));
                        localDocumentNode = localDocumentNode.get('after');
                      }
                      return tableRows;
                    })(sourceNode),
                  );
                } else {
                  if (0 == sourceRows.length) {
                    sourceRows = [currentItems];
                    currentItems.push(sourceNode);
                  } else {
                    if (1 == sourceRows.length) {
                      currentItems.push(sourceNode);
                    }
                  }
                }
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
                ) {
                  cursorOffset = insertTableCellText(
                    currentCell,
                    0 === itemIndex && 0 === currentItemIndex ? insertionOffset : 0,
                    currentItems[currentItemIndex],
                  );
                  lastCell = currentCell;
                  currentCell = DocumentNode.isType(
                    currentItems[currentItemIndex],
                    NodeType.table_cell,
                  )
                    ? TableEdit.getSibling(currentCell, false, true)
                    : TableEdit.getNextCellInColumn(currentCell);
                }
                if (!(targetRow = targetRow.get('after'))) {
                  break;
                }
                if (0 == itemIndex && sourceRows.length > 1) {
                  startColumn -= Math.max(0, sourceRows[1].length - availableColumns);
                  startColumn = Math.max(startColumn, 0);
                }
                currentCell = TableEdit.getCellAt(targetRow, startColumn);
              }
              editorInstance.findElemById(parentNode.id).replaceWith(parentNode.toHTML());
              pasteCommand.redo.push(undoManager.buildReplaceUndo(parentNode));
              if (void 0 !== cursorOffset) {
                editorInstance.selection.jumpInto(
                  editorInstance.findElemById(lastCell.id),
                  cursorOffset,
                );
              } else {
                editorInstance.selection.jumpIntoElemEnd(editorInstance.findElemById(lastCell.id));
              }
              pasteCommand.redo.push(editorInstance.selection.buildUndo());
            })(callbackDocumentNode, insertionOffset, items, pasteCommand);
          } else {
            if (DocumentNode.isType(callbackDocumentNode, NodeType.table_row, NodeType.table)) {
            } else {
              if (DocumentNode.isType(callbackDocumentNode.get('parent'), NodeType.list_item)) {
                pasteCommand.undo.push(
                  editorInstance.undo.buildReplaceUndo(callbackDocumentNode.get('parent')),
                );
              } else {
                pasteCommand.undo.push(editorInstance.undo.buildReplaceUndo(callbackDocumentNode));
              }
              var atDocumentStart =
                  callbackDocumentNode === editorInstance.nodeMap.getFirst() &&
                  0 === insertionOffset,
                disallowedMetaBlocks = [];
              items.map(function (item, itemIndex) {
                if (
                  DocumentNode.isType(item, NodeType.meta_block) &&
                  (0 != itemIndex || !atDocumentStart)
                ) {
                  disallowedMetaBlocks.push(item);
                }
              });
              disallowedMetaBlocks.map(function (item) {
                items.remove(item);
              });
              var splitResult = DocumentNode.splitAt(
                callbackDocumentNode,
                insertionOffset,
                editorInstance,
                false,
                true,
                true,
              );
              if (!splitResult) {
                return void editorInstance.undo.register(pasteCommand);
              }
              pasteBlocks(
                splitResult.prev,
                splitResult.next,
                items,
                pasteCommand,
                splitResult.insertArray,
                callbackDocumentNode,
              );
              if (splitResult.prev && items.last()) {
                try {
                  var selectionStartNode = splitResult.prev.isDeleted()
                      ? items[0]
                      : splitResult.prev,
                    lastInsertedNode = items.last();
                  if (
                    !splitResult.prev.isDeleted() &&
                    DocumentNode.isType(splitResult.prev, NodeType.list_item) &&
                    (lastInsertedNode.isDeleted() || splitResult.prev.contains(items.last()))
                  ) {
                    selectionStartNode = splitResult.prev.getVeryFirst();
                  }
                  restorePasteSelection(
                    selectionStartNode.getVeryFirst(true, false).cid,
                    insertionOffset,
                    items.last().cid,
                    void 0,
                  );
                } catch (error) {
                  window.Reporter.error(error);
                }
              }
            }
          }
          editorInstance.undo.register(pasteCommand);
        }
        function mergePasteNodes(
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
              if (copySourceFormatting && !textLength) {
                currentDocumentNode.copyContentFrom(localDocumentNode);
              }
              currentDocumentNode.set('text', mergedText);
              var removableAncestor = Object.defineProperty(
                function findRemovableAncestor(callbackDocumentNode) {
                  if (callbackDocumentNode && !callbackDocumentNode.isDeleted()) {
                    var parentNode = callbackDocumentNode.get('parent');
                    if (parentNode) {
                      if (callbackDocumentNode.get('before') || callbackDocumentNode.get('after')) {
                        return callbackDocumentNode;
                      } else {
                        return findRemovableAncestor(parentNode);
                      }
                    } else {
                      return callbackDocumentNode;
                    }
                  }
                },
                'name',
                { value: 'e', configurable: true },
              )(localDocumentNode);
              if (mergeCommand) {
                undoManager.addUndoForRemove(mergeCommand, removableAncestor);
              }
              removableAncestor.remove();
              insertedNodes.remove(removableAncestor);
              if (!inputDocumentNode.isDeleted()) {
                if (
                  DocumentNode.isType(inputDocumentNode, NodeType.list_item) &&
                  DocumentNode.isType(documentNode, NodeType.list_item)
                ) {
                  if (mergeCommand) {
                    mergeCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
                  }
                  documentNode.getLastChild().addAfterTillEnd(inputDocumentNode.getFirstChild());
                  if (mergeCommand) {
                    undoManager.addUndoForRemove(mergeCommand, inputDocumentNode);
                  }
                  inputDocumentNode.remove();
                  insertedNodes.remove(inputDocumentNode);
                }
              }
              if (mergeCommand) {
                mergeCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
              }
              return textLength;
            }
          }
        }
        function pasteText(
          documentNode,
          insertionOffset,
          inputText,
          pasteCommand,
          preserveEdgeNewlines,
        ) {
          console.debug('pasteText');
          inputText = inputText.replace(/\u00a0/g, ' ').replace(/\u200b/g, '');
          if (!preserveEdgeNewlines) {
            inputText = inputText.replace(/^[\r\n]+/g, '').replace(/[\r\n]+$/g, '');
          }
          var parts = inputText.split(/\r?\n/g);
          if (parts.length > 1 && !parts[0].trim().length && parts[1].trim().length) {
            parts = parts.slice(1);
          }
          if (DocumentNode.isType(documentNode, NodeType.table_cell)) {
            return (function (inputDocumentNode, endOffset, text, pasteCommand) {
              pasteCommand.undo.push(editorInstance.selection.buildUndo());
              text = text
                .replace(/^\s*(\r?\n)+/, '')
                .replace(/^\s*(\r?\n)+$/, '')
                .replace(/(^\s*\|)|(\|\s*)/g, '|');
              var cellSeparator = null;
              if (/\|/.exec(text)) {
                cellSeparator = /\s*\|\s*/;
              }
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
                    if ('' == items[0]) {
                      items = items.subarray(1);
                    }
                    if ('' == items.last()) {
                      items = items.subarray(0, items.length - 1);
                    }
                    var targetCell = localDocumentNode.getNthChild(childIndex);
                    items.map(function (inputItem, inputItemIndex) {
                      if (targetCell) {
                        pasteCommand.undo.push(undoManager.buildReplaceUndo(targetCell));
                        if (0 == itemIndex && 0 == inputItemIndex) {
                          inputDocumentNode.set(
                            'text',
                            inputDocumentNode.get('text').substring(0, endOffset) +
                              inputItem +
                              inputDocumentNode.get('text').substring(endOffset),
                          );
                          itemLength = endOffset + inputItem.length;
                        } else {
                          if (inputItemIndex == items.length - 1) {
                            targetCell.set('text', inputItem + targetCell.get('text'));
                          } else {
                            targetCell.set('text', inputItem);
                          }
                          currentDocumentNode = targetCell;
                          itemLength = inputItem.length;
                        }
                        pasteCommand.redo.push(undoManager.buildReplaceUndo(targetCell));
                        targetCell = targetCell.get('after');
                      }
                    });
                    editorInstance
                      .findElemById(localDocumentNode.id)
                      .replaceWith(localDocumentNode.toHTML());
                    localDocumentNode = localDocumentNode.get('after');
                  }
                });
              } else {
                pasteCommand.undo.push(undoManager.buildReplaceUndo(inputDocumentNode));
                text = text.replace(/<br\/?>/g, '\n').replace(/\r?\n/g, '<br/>');
                inputDocumentNode.set(
                  'text',
                  inputDocumentNode.get('text').substring(0, endOffset) +
                    text +
                    inputDocumentNode.get('text').substring(endOffset),
                );
                pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode));
                editorInstance
                  .findElemById(inputDocumentNode.id)
                  .replaceWith(inputDocumentNode.toHTML());
                itemLength = endOffset + text.length;
              }
              var nodeElement = editorInstance.findElemById(currentDocumentNode.cid);
              editorInstance.selection.jumpInto(nodeElement, itemLength);
              pasteCommand.redo.push(editorInstance.selection.buildUndo());
              editorInstance.undo.register(pasteCommand);
              if (nodeElement.length) {
                editorInstance.refreshUnder(nodeElement[0]);
              }
              restorePasteSelection(
                inputDocumentNode.cid,
                0,
                currentDocumentNode.cid,
                currentDocumentNode.get('text').length,
              );
            })(documentNode, insertionOffset, inputText, pasteCommand);
          }
          if (DocumentNode.noChangeLine(documentNode)) {
            parts = [parts[0]];
          }
          if (
            parts.length <= 1 ||
            formatting.CONST.NoInline.indexOf(documentNode.get('type')) > -1
          ) {
            inputText = parts.join('\n');
            insertInlineText(
              editorInstance,
              documentNode,
              inputText,
              insertionOffset,
              pasteCommand,
              true,
            );
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
                    skips: { old_code: false, pass_format: true },
                  });
                pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode));
                undoManager.addUndoForInsertArray(pasteCommand, parseResult[1].subarray(1));
                var lastParsedNode = parseResult[1].last().getVeryFirst(true),
                  cursorOffset = cursorSnapshot.end || insertedText.length + insertionOffset;
                editorInstance.findElemById(inputDocumentNode.id).replaceWith(parseResult[0]);
                editorInstance.selection.jumpInto(
                  editorInstance.findElemById(lastParsedNode.cid),
                  cursorOffset,
                );
                pasteCommand.redo.push(editorInstance.selection.buildUndo());
              }
            })(editorInstance, documentNode, inputText, insertionOffset, pasteCommand);
          } else {
            pasteCommand.undo.push(editorInstance.selection.buildUndo());
            if (
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
              DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)
            ) {
              pasteCommand.undo.push(undoManager.buildReplaceUndo(documentNode.get('parent')));
            } else {
              pasteCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
            }
            if (
              DocumentNode.isType(documentNode, NodeType.paragraph) &&
              !DocumentNode.isType(documentNode.get('parent'), NodeType.list_item)
            ) {
              return (function (inputDocumentNode, endOffset, insertedText, pasteCommand) {
                var text = inputDocumentNode.get('text');
                inputDocumentNode.set(
                  'text',
                  text.substring(0, endOffset) + insertedText + text.substring(endOffset),
                );
                var parseResult = inputDocumentNode.parseFrom({
                  skips: { old_code: false, pass_format: true },
                });
                pasteCommand.redo.push(undoManager.buildReplaceUndo(inputDocumentNode));
                undoManager.addUndoForInsertArray(pasteCommand, parseResult[1].subarray(1));
                editorInstance.findElemById(inputDocumentNode.id).replaceWith(parseResult[0]);
                var currentDocumentNode = parseResult[1].last().getVeryFirst(true),
                  cursorOffset = Math.max(
                    currentDocumentNode.get('text').length - (text.length - endOffset),
                    0,
                  );
                editorInstance.selection.jumpInto(
                  editorInstance.findElemById(currentDocumentNode.cid),
                  cursorOffset,
                );
                pasteCommand.redo.push(editorInstance.selection.buildUndo());
                editorInstance.undo.register(pasteCommand);
                editorInstance.focusCid = currentDocumentNode.cid;
                editorInstance.refresh();
                restorePasteSelection(
                  inputDocumentNode.cid,
                  0,
                  currentDocumentNode.cid,
                  currentDocumentNode.get('text').length,
                );
              })(documentNode, insertionOffset, inputText, pasteCommand);
            }
            var splitResult = DocumentNode.splitAt(documentNode, insertionOffset, editorInstance);
            if (!splitResult) {
              return void editorInstance.undo.register(pasteCommand);
            }
            var parsedBlocks = DocumentNode.parseFrom(
              parts.join('\n'),
              documentNode.get('in'),
              {
                noTop: !splitResult.prev.get('attachTo'),
                skips: { old_code: false, pass_format: true },
              },
              true,
            );
            if (DocumentNode.isType(splitResult.prev, NodeType.list_item)) {
              pasteCommand.undo.push(undoManager.buildReplaceUndo(splitResult.prev));
            }
            pasteBlocks(
              splitResult.prev,
              splitResult.next,
              parsedBlocks[1],
              pasteCommand,
              splitResult.insertArray,
              documentNode,
            );
          }
          editorInstance.undo.register(pasteCommand);
          restorePasteSelection(
            documentNode.cid,
            insertionOffset,
            documentNode.cid,
            insertionOffset + inputText.length,
            pasteCommand,
          );
        }
        function pasteBlocks(
          precedingNode,
          searchValue,
          items,
          pasteCommand,
          inputItems,
          originalNode,
        ) {
          console.debug('pasteBlocks');
          var currentSearchValue,
            nodeId = originalNode.id,
            mergedCursorOffset = -1;
          items = (function (sourceBlocks) {
            for (
              var currentItems = [], previousCellIndex = -2, itemIndex = 0;
              itemIndex < sourceBlocks.length;
              itemIndex++
            ) {
              var documentNode = sourceBlocks[itemIndex];
              if (DocumentNode.isType(documentNode, NodeType.table_cell)) {
                if (previousCellIndex !== itemIndex - 1) {
                  documentNode.set('type', NodeType.paragraph);
                  currentItems.push(documentNode);
                } else {
                  currentItems
                    .last()
                    .set('text', currentItems.last().get('text') + '  ' + documentNode.get('text'));
                  documentNode.remove();
                }
                previousCellIndex = itemIndex;
              } else {
                currentItems.push(documentNode);
              }
            }
            return currentItems;
          })(
            (items = (function (callbackItems) {
              var type,
                hasListItems,
                currentItems = [];
              callbackItems.map(function (documentNode) {
                if (DocumentNode.isType(documentNode, NodeType.list_item)) {
                  hasListItems = true;
                  if (!type) {
                    type = new DocumentNode({ type: type, in: documentNode.get('in') });
                    currentItems.push(type);
                  }
                  type.appendChild(documentNode);
                } else {
                  type = null;
                  currentItems.push(documentNode);
                }
              });
              if (hasListItems) {
                console.log('group list items');
                var previousNode = callbackItems[0].get('before'),
                  nextNode = callbackItems.last().get('after'),
                  parentNode = callbackItems[0].get('parent');
                if (previousNode) {
                  previousNode.addArrayAfter(currentItems, true);
                } else {
                  if (nextNode) {
                    nextNode.addArrayBefore(currentItems, true);
                  } else {
                    if (parentNode) {
                      currentItems.forEach((inputItem) => parentNode.appendChild(inputItem));
                    } else {
                      var item;
                      currentItems.forEach((inputItem) => {
                        if (item) {
                          item.addAfter(inputItem);
                        }
                        item = inputItem;
                      });
                    }
                  }
                }
              }
              return currentItems;
            })(items)),
          );
          currentSearchValue = items.last().getVeryFirst(true);
          var insertionIndex = (inputItems = inputItems || [searchValue]).indexOf(searchValue),
            removedFollowingNode = false;
          if (isEmptyPasteTarget(searchValue)) {
            inputItems.remove(searchValue);
            searchValue.remove();
            removedFollowingNode = true;
          } else {
            if (DocumentNode.isType(currentSearchValue, formatting.CONST.Selectable)) {
              currentSearchValue = searchValue;
            }
          }
          if (
            !DocumentNode.isType(precedingNode, NodeType.blockquote, NodeType.list) &&
            !DocumentNode.isType(items[0], NodeType.list_item)
          ) {
            if (DocumentNode.isType(precedingNode, NodeType.list_item)) {
              !(function (documentNode, inputDocumentNode, copySourceFormatting) {
                console.debug('handlerPasteIntoList');
                var currentDocumentNode = documentNode.get('parent');
                if (!DocumentNode.isType(items[0], NodeType.list)) {
                  (function () {
                    var listClone = currentDocumentNode.clone();
                    if (DocumentNode.isType(items[0], NodeType.list_item)) {
                      items.forEach((item) => {
                        if (DocumentNode.isType(item, NodeType.list_item)) {
                          currentDocumentNode.appendChild(item);
                        } else {
                          let documentNodeInstance = new DocumentNode({ type: NodeType.list_item });
                          currentDocumentNode.appendChild(documentNodeInstance);
                          documentNodeInstance.appendChild(item);
                        }
                      });
                    } else {
                      var currentDocumentNodeInstance = new DocumentNode({
                        type: NodeType.list_item,
                      });
                      listClone.appendChild(currentDocumentNodeInstance);
                      items.forEach((item) => {
                        currentDocumentNodeInstance.appendChild(item);
                      });
                    }
                    items = [listClone];
                  })();
                }
                nodeId = documentNode.id;
                pasteCommand.undo.push(undoManager.buildAttrUndo(currentDocumentNode, 'tail'));
                documentNode.addAfter(items[0]);
                var currentItems = items.shift().unwrap();
                if (!(copySourceFormatting && !isEmptyPasteTarget(documentNode))) {
                  if (
                    void 0 !=
                    mergePasteNodes(documentNode, currentItems[0], null, [], copySourceFormatting)
                  ) {
                    currentItems.splice(0, 1);
                  }
                }
                if (!(inputDocumentNode.isDeleted() || items.length)) {
                  mergePasteNodes(currentItems.last(), inputDocumentNode, null, []);
                }
                if (!inputDocumentNode.isDeleted()) {
                  currentItems.push(inputDocumentNode);
                }
                pasteCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
                var replacementNodes = DocumentNode.genArrFrom(documentNode);
                undoManager.addUndoForInsertArray(pasteCommand, currentItems);
                editorInstance
                  .findElemById(documentNode.cid)
                  .replaceWith(nodeCollectionUtilities.toHTML([documentNode].concat(currentItems)));
                if (currentSearchValue.isDeleted()) {
                  currentSearchValue = inputDocumentNode;
                }
                if (items.length) {
                  currentDocumentNode.unset('tail');
                  if (inputDocumentNode.isDeleted()) {
                    inputDocumentNode =
                      (inputDocumentNode = currentItems.last()) && inputDocumentNode.get('after');
                  }
                  if (inputDocumentNode) {
                    var trailingList = currentDocumentNode.clone();
                    trailingList.unset('start');
                    trailingList.unset('ahead');
                    var removedNodes = DocumentNode.genArrFrom(inputDocumentNode);
                    undoManager.addUndoForRemoveArray(pasteCommand, removedNodes);
                    trailingList.appendChildrenTillEnd(inputDocumentNode);
                    currentDocumentNode.addAfter(trailingList);
                    currentDocumentNode.addArrayAfter(items);
                    replacementNodes = items.concat([trailingList]);
                    undoManager.addUndoForInsertArray(pasteCommand, replacementNodes);
                    editorInstance
                      .findElemById(currentDocumentNode.cid)
                      .replaceWith(
                        nodeCollectionUtilities.toHTML(
                          [currentDocumentNode].concat(replacementNodes),
                        ),
                      );
                    if (currentSearchValue.isDeleted()) {
                      currentSearchValue = inputDocumentNode;
                    }
                  } else {
                    currentDocumentNode.addArrayAfter(items);
                    undoManager.addUndoForInsertArray(pasteCommand, items);
                    editorInstance
                      .findElemById(currentDocumentNode.cid)
                      .after(nodeCollectionUtilities.toHTML(items));
                  }
                }
              })(precedingNode, searchValue, removedFollowingNode);
            } else {
              var insertionLeaf = precedingNode.getVeryFirst(true);
              insertionLeaf.addArrayAfter(items);
              if (insertionIndex > -1) {
                inputItems.splice.apply(inputItems, [insertionIndex, 0].concat(items));
              }
              undoManager.addUndoForInsertArray(pasteCommand, inputItems);
              var copyTrailingFormatting = items.length > 1;
              if (DocumentNode.isEmptyBlock(insertionLeaf)) {
                undoManager.addUndoForRemove(pasteCommand, insertionLeaf);
                insertionLeaf.remove();
                copyTrailingFormatting = DocumentNode.isEmptyBlock(items.last());
              } else {
                copyTrailingFormatting = false;
                mergePasteNodes(insertionLeaf, items.shift(), pasteCommand, inputItems);
              }
              if (!searchValue.isDeleted()) {
                if (DocumentNode.isEmptyBlock(searchValue)) {
                  undoManager.addUndoForRemove(pasteCommand, searchValue);
                  searchValue.remove();
                } else {
                  mergedCursorOffset = items.length
                    ? mergePasteNodes(
                        items.last(),
                        searchValue,
                        pasteCommand,
                        inputItems,
                        copyTrailingFormatting,
                      )
                    : mergePasteNodes(precedingNode, searchValue, pasteCommand, inputItems);
                }
              }
              if (
                (currentSearchValue = items.last() || precedingNode) &&
                !currentSearchValue.isDeleted()
              ) {
                currentSearchValue = currentSearchValue.getVeryFirst(true);
              }
              if (!originalNode.isDeleted()) {
                pasteCommand.redo.push(undoManager.buildReplaceUndo(originalNode));
              }
              var replacementHtml =
                (originalNode.isDeleted() ? '' : originalNode.toHTML()) +
                inputItems
                  .map(function (item) {
                    if (item.isDeleted()) {
                      return '';
                    } else {
                      return item.toHTML();
                    }
                  })
                  .join('');
              editorInstance.mathBlock.beforeRenderMath();
              editorInstance.findElemById(nodeId).replaceWith(replacementHtml);
            }
            if (DocumentNode.isType(currentSearchValue, formatting.CONST.Selectable)) {
              if (searchValue && !searchValue.isDeleted()) {
                currentSearchValue = searchValue;
              }
              mergedCursorOffset = -1;
            }
            try {
              if (mergedCursorOffset >= 0) {
                editorInstance.selection.jumpInto(
                  editorInstance.findElemById(currentSearchValue.cid),
                  mergedCursorOffset,
                );
              } else {
                if (currentSearchValue == searchValue) {
                  editorInstance.selection.jumpIntoElemBegin(
                    editorInstance.findElemById(searchValue.cid),
                  );
                } else {
                  if (currentSearchValue.isDeleted()) {
                    editorInstance.selection.jumpIntoElemBegin(
                      editorInstance.findElemById(searchValue.cid),
                    );
                  } else {
                    editorInstance.selection.jumpIntoElemEnd(
                      editorInstance.findElemById(currentSearchValue.getVeryFirst(true).cid),
                    );
                  }
                }
              }
              if (!currentSearchValue.isDeleted()) {
                pasteCommand.redo.push(editorInstance.selection.buildUndo());
              }
            } catch (error) {
              console.warn(error);
            }
            editorInstance.tryEnterBusyMode();
            setTimeout(function () {
              editorInstance.refocus();
              editorInstance.refresh();
            }, 0);
            setTimeout(function () {
              editorInstance.selection.scrollAdjust();
            }, 100);
          }
        }
        function replaceSelectionWithPaste(clipboardContent) {
          pasteCommand.undo.push(editorInstance.selection.buildUndo());
          pasteCommand = undoManager.append(
            pasteCommand,
            backspaceHandler(editorInstance, event, 'delSelection', true),
          );
          targetNode = editorInstance.findNodeByElem(editorInstance.getMarkElem());
          range = editorInstance.selection.getRangy();
          if (targetNode && range) {
            start = range.getBookmark(editorInstance.findElemById(targetNode.id)[0]).start;
            var currentElement = editorInstance.getJQueryElem(range.startContainer);
            pasteAsPlainText =
              pasteAsPlainText ||
              (range.startContainer &&
                currentElement.closest('.md-def-url, .md-def-name, .md-def-title, pre, code')
                  .length);
            markhtml = clipboardContent.markhtml;
            html = clipboardContent.html;
            currentText = clipboardContent.text;
            clipboardBaseUrl = clipboardContent.baseUrlInClipboard || '';
            remap = clipboardContent.remap;
            if (markhtml) {
              markhtml = markhtml.replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
            }
            if (html) {
              html = html.replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
            }
            if (currentText) {
              currentText = currentText.replace(/[\u0000-\u0008\u000b-\u001f]/g, '');
            }
            if (pasteAsPlainText) {
              if (!utilities.isDefined(currentText)) {
                currentText = htmlParser.parseInlineHTML(
                  html,
                  editorInstance,
                  clipboardBaseUrl,
                  remap,
                );
              }
              pasteText(targetNode, start, (currentText = currentText || ''), pasteCommand);
            } else {
              if (markhtml) {
                var clipboardElement = $($.parseHTML('<div>' + markhtml + '</div>')[0]);
                selectionRestoreOverride =
                  selectionRestoreOverride ||
                  (clipboardElement.find('[data-copy-from-path]').attr('data-copy-from-path') ||
                    '-1') === File.bundle.filePath;
                insertParsedContent(
                  targetNode,
                  start,
                  pasteCommand,
                  clipboardElement,
                  parseMarkdownHtml,
                );
              } else {
                if (html) {
                  if (currentElement.closest('.md-def-content').length) {
                    currentText =
                      (currentText = htmlParser.parseInlineHTML(
                        html,
                        editorInstance,
                        clipboardBaseUrl,
                        remap,
                      )) ||
                      clipboardContent.text ||
                      '';
                    pasteText(targetNode, start, currentText, pasteCommand);
                  } else {
                    insertParsedContent(
                      targetNode,
                      start,
                      pasteCommand,
                      html,
                      htmlParser.parseHTML,
                      currentText,
                    );
                  }
                } else {
                  if (!(clipboardContent.files || []).length) {
                    return void JSBridge.clipboard.readImage().then(function (result) {
                      if (result && result.length) {
                        pasteFilePaths(editorInstance, result, pasteCommand);
                      } else {
                        pasteText(targetNode, start, currentText || '', pasteCommand);
                      }
                      editorInstance.selection.scrollAdjust();
                      window.Reporter.fullValidate();
                    });
                  }
                  pasteFilePaths(editorInstance, clipboardContent.files, pasteCommand);
                  editorInstance.undo.addSnap(targetNode.id, 0);
                  editorInstance.selection.scrollAdjust();
                }
              }
            }
            editorInstance.undo.addSnap(targetNode.id, 0);
            editorInstance.selection.scrollAdjust();
            window.Reporter.fullValidate();
          }
        }
      },
      'name',
      { value: 'L', configurable: true },
    ),
    pasteFilePaths = Object.defineProperty(
      function (editorInstance, filePaths, pasteCommand) {
        if (pasteCommand) {
          editorInstance.undo.register(pasteCommand);
        }
        if (File.isMac) {
          if (File.bundle.isLocked) {
            return;
          }
        } else {
          if (File.isLocked) {
            return false;
          }
        }
        if (!editorInstance.sourceView.inSourceMode) {
          mediaActions.insertURLs(filePaths);
        }
      },
      'name',
      { value: 'N', configurable: true },
    );
  if (window.bridge) {
    bridge.registerHandler('clipboard.processClipboardHTML', function (htmlContent, respond) {
      restoreCopySelection(File.editor);
      respond(extractClipboardContent(htmlContent));
    });
  }
  var restoreCopySelection = Object.defineProperty(
    function (editorInstance) {
      if (savedCopyRange) {
        document.body.classList.remove('marklyra-on-copy');
        if (true !== savedCopyRange) {
          editorInstance.selection.setRange(savedCopyRange);
        }
      }
    },
    'name',
    { value: 'D', configurable: true },
  );
  moduleExports.getMarkdownSourceFrom = markupToMarkdown;
  moduleExports.nativeCopyText = function (plainText) {
    var textareaElement = document.createElement('textarea');
    document.body.appendChild(textareaElement);
    textareaElement.value = plainText;
    textareaElement.focus();
    textareaElement.select();
    document.execCommand('Copy');
    textareaElement.remove();
  };
  moduleExports.copyAsMarkdown = copySelection;
  moduleExports.copyAsSemanticHTML = cutSelection;
  moduleExports.copyAsHTMLSource = copyAsMarkdown;
  moduleExports.copyAsPlainText = copyAsPlainText;
  moduleExports.copyHandler = function (editorInstance, clipboardEvent, afterCopy) {
    if ('copyAsMarkdown' === File._CopyContentFlag) {
      copySelection(editorInstance, clipboardEvent);
      return true;
    }
    if ('copyAsHTMLSource' === File._CopyContentFlag) {
      copyAsMarkdown(editorInstance, clipboardEvent);
      return true;
    }
    if ('copyAsSemanticHTML' === File._CopyContentFlag) {
      cutSelection(editorInstance, clipboardEvent);
      return true;
    }
    if ('copyAsPlainText' === File._CopyContentFlag) {
      copyAsPlainText(editorInstance, clipboardEvent);
      return true;
    }
    var domNode = document.activeElement,
      range = editorInstance.selection.getRangy(),
      element = $(domNode).closest('[cid]');
    if (editorInstance.sourceView.inSourceMode) {
      let selection = File.editor.sourceView.cm.getSelection();
      if (selection) {
        writeClipboardFormats(null, null, selection, true, clipboardEvent);
      }
      return true;
    }
    if (isInputComponent(domNode)) {
      if (!clipboardEvent) {
        console.sendError("in copyHandler : shouldn't be here");
      }
      return true;
    }
    if ('hr' == domNode.getAttribute('mdtype')) {
      writeClipboardFormats(domNode.outerHTML, null, '---', true, clipboardEvent);
      return true;
    }
    if ('toc' == domNode.getAttribute('mdtype')) {
      writeClipboardFormats(
        domNode.outerHTML,
        "<div mdtype='toc'><div>",
        '[toc]',
        true,
        clipboardEvent,
      );
      return true;
    }
    if ('IMG' == domNode.tagName) {
      writeClipboardFormats(
        domNode.outerHTML,
        null,
        domNode.getAttribute('src') || '',
        true,
        clipboardEvent,
      );
      return true;
    }
    if (element.attr('mdtype') === NodeType.math_block && (!range || range.collapsed)) {
      var mathSource = editorInstance.mathBlock.getTex(element.attr('cid'));
      writeClipboardFormats(
        (domNode.querySelector('.MathJax_Display') || {}).outerHTML || '',
        "<div mdtype='" + NodeType.math_block + "'>" + mathSource + '</div>',
        mathSource,
        true,
        clipboardEvent,
      );
      return true;
    }
    if (element.attr('mdtype') === NodeType.html_block && (!range || range.collapsed)) {
      var documentNode = editorInstance.getNode(element.attr('cid')),
        text = documentNode.get('text');
      writeClipboardFormats(
        text,
        "<div mdtype='" +
          NodeType.html_block +
          "' data-tag='" +
          utilities.escape(documentNode.get('style')) +
          "'>" +
          utilities.escape(text) +
          '</div>',
        text,
        true,
        clipboardEvent,
      );
      return true;
    }
    if (range) {
      if (
        range.startContainer &&
        range.startContainer.parentElement &&
        range.startContainer.parentElement.closest('.marklyra-table-edit')
      ) {
        var firstCellSpan = element.closest('table').find('.td-span')[0];
        if (firstCellSpan) {
          range.setStart(firstCellSpan, 0);
          editorInstance.selection.setRange(range, true);
        }
      }
      var lineWiseCopy = clipboardEvent && range.collapsed && File.option.lineWiseCopyCut;
      if (!File._CopyContentRange && lineWiseCopy) {
        if (!File._CopyContentFlag) {
          document.querySelector('#no-sel-style').innerHTML =
            '::selection {\n\t\t\t\t\tbackground: transparent;\n\t\t\t\t\ttext-shadow: none;\n\t\t\t\t\tcolor: inherit;\n\t\t\t\t}';
          setTimeout(() => {
            if (File._CopyContentRange) {
              if (!(editorInstance.selection.getRangy() || {}).collapsed) {
                document.querySelector('#no-sel-style').innerHTML = '';
              }
            }
          }, 1e3);
        }
        editorInstance.selection.selectLineWrap();
      }
      if (File._CopyContentRange) {
        setTimeout(() => {
          editorInstance.selection.setRange(File._CopyContentRange);
          File._CopyContentRange = null;
          document.querySelector('#no-sel-style').innerHTML = '';
        }, 0);
      }
      if (!range.collapsed || lineWiseCopy) {
        if (!File._CopyContentFlag && File.isNode) {
          File._CopyContentFlag = true;
          if (lineWiseCopy) {
            File._CopyContentRange = range;
          }
          electron.clipboard.clear();
          JSBridge.invoke('webContents.copy');
          return false;
        }
        if ('cut_before' === File._CopyContentFlag && lineWiseCopy) {
          return void (editorInstance.selection.isSameRange(File._CopyContentRange, range)
            ? ((File._CopyContentRange = null), (File._CopyContentFlag = false))
            : ((File._CopyContentRange = range), JSBridge.invoke('webContents.copy')));
        }
        if (lineWiseCopy && File.isMac) {
          File._CopyContentRange = range;
          range = editorInstance.selection.getRangy();
        }
        var selectedHtml = '';
        if (lineWiseCopy || File._CopyContentRange) {
          let currentDomNode = editorInstance.findElemById(editorInstance.focusCid)[0],
            selectionBookmark = range.getBookmark(currentDomNode || void 0);
          if (
            range.commonAncestorContainer != currentDomNode &&
            range.commonAncestorContainer.contains(currentDomNode)
          ) {
            selectedHtml = range.toHtml() + '<br/>';
          } else {
            if (
              0 === selectionBookmark.start &&
              selectionBookmark.end >= currentDomNode.textContent.length
            ) {
              selectedHtml = currentDomNode.outerHTML + "<p mdtype='paragraph'></p>";
              if (
                !(
                  currentDomNode.previousElementSibling ||
                  (currentDomNode.previousElementSibling &&
                    'INPUT' != currentDomNode.previousElementSibling.tagName)
                )
              ) {
                if ('LI' == currentDomNode.parentElement.tagName) {
                  selectedHtml =
                    currentDomNode.parentElement.outerHTML + "<li mdtype='list_item'></li>";
                } else {
                  if (DocumentNode.isType(currentDomNode.parentElement.tagName, 'BLOCKQUOTE')) {
                    selectedHtml =
                      currentDomNode.parentElement.outerHTML + "<p mdtype='paragraph'></p>";
                  }
                }
              }
            } else {
              selectedHtml = range.toHtml() + '<br/>';
            }
          }
        } else {
          editorInstance.selection.includeTrailMeta(range);
          selectedHtml = range.toHtml();
        }
        var markHtml = htmlParser.getMarkElemFromCurrentHtml(selectedHtml, editorInstance).html(),
          plainText = File.option.copyMarkdownByDefault
            ? markupToMarkdown(markHtml)
            : markupToPlainText(markHtml).replace(/\u200B/gi, '');
        if (clipboardEvent && File.isMac) {
          setTimeout(function () {
            writeClipboardFormats(null, markHtml, plainText, false, clipboardEvent);
            bridge.callHandler('clipboard.postCopy', lineWiseCopy ? void 0 : afterCopy);
            if (lineWiseCopy) {
              if (afterCopy) {
                afterCopy();
              }
              if ('copy' == clipboardEvent.type) {
                editorInstance.selection.setRange(File._CopyContentRange);
                document.querySelector('#no-sel-style').innerHTML = '';
              } else {
                setTimeout(function () {
                  document.querySelector('#no-sel-style').innerHTML = '';
                }, 30);
              }
              File._CopyContentRange = null;
            }
          }, 0);
        } else {
          writeClipboardFormats(null, markHtml, plainText, false, clipboardEvent);
        }
        return false;
      }
    }
  };
  moduleExports.insertInlineText = insertInlineText;
  moduleExports.pasteHandler = pasteContent;
  moduleExports.setClipboard = writeClipboardFormats;
  moduleExports.prepMarkHtml = function (htmlContent, editorInstance) {
    return htmlParser.getMarkElemFromCurrentHtml(htmlContent, editorInstance);
  };
  moduleExports.insertParagraph = function (insertBefore, editorInstance, targetElement) {
    if (!File.isNode || !File.isLocked) {
      editorInstance = editorInstance || File.editor;
      targetElement = targetElement || editorInstance.getMarkElem();
      editorInstance.undo.endSnap(true);
      var documentNode = editorInstance.findNodeByElem(targetElement),
        documentNodeInstance = new DocumentNode({ type: NodeType.paragraph, text: '' }),
        insertCommand = undoManager.makeEmptyCommand(
          editorInstance.selection.buildUndo(void 0, targetElement),
        );
      if (documentNode) {
        documentNode = documentNode.getClosetBlock();
        if (insertBefore) {
          documentNode.addBefore(documentNodeInstance);
          editorInstance.findElemById(documentNode.cid).before(documentNodeInstance.toHTML());
        } else {
          documentNode.addAfter(documentNodeInstance);
          editorInstance.findElemById(documentNode.cid).after(documentNodeInstance.toHTML());
        }
        undoManager.addUndoForInsert(insertCommand, documentNodeInstance);
        editorInstance.selection.jumpIntoElemBegin(
          editorInstance.findElemById(documentNodeInstance.cid),
        );
        insertCommand.redo.push(editorInstance.selection.buildUndo());
        editorInstance.undo.register(insertCommand);
        editorInstance.refocus();
        window.Reporter.fullValidate();
      }
    }
  };
  moduleExports.insertDom = function (domContent) {
    File.editor.focusAndRestorePos();
    pasteContent(File.editor, $('<div>').append(domContent).html(), false);
  };
  moduleExports.processClipboardHTML = extractClipboardContent;
  moduleExports.beforeCopyStart = function (editorInstance) {
    savedCopyRange = null;
    if (File.isMac) {
      document.body.classList.add('marklyra-on-copy');
      savedCopyRange = true;
      setTimeout(() => {
        restoreCopySelection(editorInstance);
      }, 1);
    }
  };
  moduleExports.getSpeechText = function (inputEditor) {
    if ((inputEditor = File.editor).sourceView.inSourceMode) {
      return inputEditor.sourceView.cm.getSelection() || inputEditor.sourceView.cm.getValue();
    }
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
    return markupToPlainText(
      htmlParser.getMarkElemFromCurrentHtml(selectionRange.toHtml(), inputEditor).html(),
    );
  };
}
