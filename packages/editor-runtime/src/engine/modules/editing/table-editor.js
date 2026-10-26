// editing/table-editor.
export default function initializeEditingTableEditor(requireModule, moduleExports, moduleRecord) {
  'use strict';

  if (!this) {
    self;
  }
  var jquery = requireModule('libraries/jquery'),
    documentModel = requireModule('model/document-model'),
    NodeType = documentModel.TYPE,
    DocumentNode = documentModel.Node,
    undoManager = requireModule('editing/undo-manager'),
    documentMenu = (requireModule('host/environment'), requireModule('ui/document-menu')),
    map = requireModule('editing/keyboard-shortcuts').map,
    maxRows = 99,
    maxColumns = 40;
  class TableEditor {
    constructor(inputEditor) {
      var insertDialog,
        receiver = this;
      this.editor = inputEditor;
      this.TableEdit = TableEditor;
      jquery(inputEditor.sessionStr)
        .on('click', '.md-align-gp button', function (inputEvent) {
          var nextAlignment,
            textSlice = /md-align-\S+/g.exec(this.className)[0].substring(9),
            element = jquery(this).closest('[mdtype="table"]'),
            documentNode = inputEditor.findNodeByElem(element),
            [firstColumn, lastColumn] =
              (function (range) {
                if (!(range = range || inputEditor.selection.getRangy())) {
                  return null;
                }
                var tableCell = jquery(range.startContainer).closest('td, th'),
                  length = tableCell.prevAll().length,
                  currentTableCell = jquery(range.endContainer).closest('td, th');
                return [
                  length,
                  currentTableCell.parent().is(tableCell.parent())
                    ? currentTableCell.prevAll().length
                    : currentTableCell.parent().children().length,
                ];
              })() || [];
          if (void 0 !== firstColumn) {
            for (
              var alignmentCommand = null, itemIndex = firstColumn;
              itemIndex <= lastColumn;
              itemIndex++
            ) {
              nextAlignment = documentNode.get('align')[itemIndex] == textSlice ? null : textSlice;
              var columnCommand = documentNode.attr(
                'align_idx',
                [itemIndex, nextAlignment],
                inputEditor,
              );
              if (itemIndex > firstColumn) {
                inputEditor.undo.removeLastRegisteredOperationCommand();
                undoManager.append(alignmentCommand, columnCommand);
              } else {
                alignmentCommand = columnCommand;
              }
            }
            if (lastColumn > firstColumn) {
              inputEditor.undo.register(alignmentCommand);
            }
            inputEvent.stopPropagation();
            if (inputEditor.lastCursor) {
              inputEditor.undo.exeCommand(inputEditor.lastCursor);
            }
          }
        })
        .on('click', '.md-delete-table', function () {
          inputEditor.tableEdit.deleteTable(jquery(this).closest("[mdtype='table']"));
        })
        .on('click', '.md-resize-table', function (inputEvent) {
          if (jquery(this).next('.md-table-resize-popover').length) {
            jquery('.md-table-resize-popover').remove();
            if (inputEditor.lastCursor) {
              inputEditor.undo.exeCommand(inputEditor.lastCursor);
            }
          } else {
            (function (inputElement) {
              var elements,
                resizePopoverHtml =
                  '<div class="popover bottom md-table-resize-popover" style="display:block; bottom:auto; top:20px; margin-left:-10px;" contenteditable="false">\t\t\t\t<div class="arrow" style="left:20px;"></div>\t\t\t\t<div class="md-grid-board-wrap md-reset code-tooltip-content">\t\t\t\t\t<table role="grid" class="md-grid-board md-reset">\t\t\t\t\t\t<tbody>\t\t\t\t\t\t\t<tr class="md-reset" row="1">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="2">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="3">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="4">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="5">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="6">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="7">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="8">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="9">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t\t<tr class="md-reset" row="10">\t\t\t\t\t\t\t\t<td class="md-reset" col="1"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="2"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="3"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="4"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="5"><a href="#"></a></td>\t\t\t\t\t\t\t\t<td class="md-reset" col="6"><a href="#"></a></td>\t\t\t\t\t\t\t</tr>\t\t\t\t\t\t</tbody>\t\t\t\t\t</table>\t\t\t\t\t<div class="popover-title">\t\t\t\t\t\t<input id="md-grid-width" type="text"  max="20" size="2" min="1" value="0" /> x <input id="md-grid-height" maxlength="2" size="2" min="1" value="0"/><button id="md-resize-grid" class="btn btn-primary btn-xs">' +
                  jquery.localize.getString('OK') +
                  '</button>\t\t\t\t\t</div>\t\t\t\t</div>\t\t\t</div>',
                element = inputElement.closest('[mdtype="table"]'),
                documentNode = inputEditor.findNodeByElem(element),
                alignmentLength = documentNode.get('align').length,
                rowCount = element.children('table').children('tbody').children('tr').length + 1;
              function updateGridSelection() {
                if (!jquery(this).val().trim().length) {
                  jquery(this).val(2);
                }
                var selectedColumns = elements.find('#md-grid-width').val(),
                  selectedRows = elements.find('#md-grid-height').val();
                elements.find('a.md-active').removeClass('md-active');
                elements
                  .find(
                    'tr:nth-child(-n+' +
                      selectedRows +
                      ')>td:nth-child(-n+' +
                      selectedColumns +
                      ')>a',
                  )
                  .addClass('md-active');
              }
              jquery('.md-table-resize-popover').remove();
              inputElement.append(resizePopoverHtml);
              (elements = inputElement.find('.md-table-resize-popover'))
                .find('tr:nth-child(-n+' + rowCount + ')>td:nth-child(-n+' + alignmentLength + ')')
                .addClass('md-grid-ext');
              elements
                .find('#md-grid-width, #md-grid-height')
                .off('keydown keypress')
                .on('keypress', function (keyboardEvent) {
                  if (!/\d/.exec(String.fromCharCode(keyboardEvent.which))) {
                    return false;
                  }
                })
                .on('keydown', function (keyboardEvent) {
                  var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
                  if ('Up' === map[keyCode]) {
                    this.value = this.value - 0 + 1;
                    this.value = Math.min(
                      'md-grid-height' == this.getAttribute('id') ? maxRows : maxColumns,
                      this.value,
                    );
                    return false;
                  } else {
                    if ('Down' === map[keyCode]) {
                      this.value = this.value - 1;
                      this.value = Math.max(1, this.value);
                      return false;
                    } else {
                      return void 0;
                    }
                  }
                });
              elements
                .find('#md-grid-width')
                .val(alignmentLength)
                .off('blur focus')
                .blur(updateGridSelection)
                .focus(function () {
                  elements.find('#md-resize-grid').show();
                })
                .blur(function () {
                  if (this.value > maxColumns) {
                    this.value = maxColumns;
                  } else {
                    if (this.value < 1) {
                      this.value = 1;
                    }
                  }
                })
                .on('keydown', function (keyboardEvent) {
                  var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
                  if ('Tab' === map[keyCode] && !keyboardEvent.ctrlKey) {
                    elements.find('#md-grid-height').focus();
                    return false;
                  }
                  if ('Enter' === map[keyCode]) {
                    elements.find('#md-grid-height').focus();
                  }
                });
              elements
                .find('#md-grid-height')
                .val(rowCount)
                .off('blur focus')
                .blur(updateGridSelection)
                .focus(function () {
                  elements.find('#md-resize-grid').show();
                })
                .blur(function () {
                  if (this.value > maxRows) {
                    this.value = maxRows;
                  } else {
                    if (this.value < 1) {
                      this.value = 1;
                    }
                  }
                })
                .on('keydown', function (keyboardEvent) {
                  var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
                  if ('Tab' === map[keyCode] && !keyboardEvent.ctrlKey) {
                    elements.find('#md-grid-width').focus();
                    return false;
                  }
                  if ('Enter' === map[keyCode]) {
                    elements.find('#md-resize-grid').click();
                  }
                });
              elements
                .find('.md-grid-board a')
                .off('mouseenter mouseleave click')
                .hover(function () {
                  var tableCell = jquery(this).closest('td'),
                    hoveredColumn = tableCell.prevAll().length + 1,
                    hoveredRow = tableCell.closest('tr').prevAll().length + 1;
                  elements.find('a.md-active').removeClass('md-active');
                  elements
                    .find(
                      'tr:nth-child(-n+' +
                        hoveredRow +
                        ')>td:nth-child(-n+' +
                        hoveredColumn +
                        ')>a',
                    )
                    .addClass('md-active');
                  elements.find('#md-grid-width').val(hoveredColumn);
                  elements.find('#md-grid-height').val(hoveredRow);
                  elements.find('#md-resize-grid').hide();
                })
                .click(function (callbackEvent) {
                  callbackEvent.stopPropagation();
                  callbackEvent.preventDefault();
                  elements.find('#md-resize-grid').click();
                });
              elements
                .find('.md-grid-board')
                .off('mouseleave')
                .on('mouseleave', function (unusedParameter1) {
                  jquery(this).find('a').removeClass('md-active');
                  jquery('#md-grid-width').val(alignmentLength);
                  jquery('#md-grid-height').val(rowCount);
                });
              elements
                .find('#md-resize-grid')
                .off('click')
                .click(function (unusedParameter1) {
                  var localDocumentNode,
                    columnCount = (elements.find('#md-grid-width').val() || 0) - 0,
                    rowCount = (elements.find('#md-grid-height').val() || 0) - 0,
                    currentDocumentNode = documentNode.getFirstChild(),
                    currentAlignmentLength = documentNode.get('align').length,
                    rowIndex = 0,
                    resizeCommand = inputEditor.undo.UndoManager.makeEmptyCommand();
                  for (
                    inputEditor.undo.endSnap(true),
                      resizeCommand.undo.push(inputEditor.undo.buildReplaceUndo(documentNode));
                    currentDocumentNode || rowIndex < rowCount;
                  ) {
                    if (rowIndex < rowCount) {
                      if (currentDocumentNode) {
                        TableEditor.resizeRow(currentDocumentNode, columnCount, documentNode);
                      } else {
                        currentDocumentNode = TableEditor.newEmptyRowAfter(
                          localDocumentNode,
                          columnCount,
                          documentNode,
                        );
                      }
                      currentDocumentNode = (localDocumentNode = currentDocumentNode).get('after');
                    } else {
                      if (currentDocumentNode) {
                        localDocumentNode = currentDocumentNode;
                        currentDocumentNode = currentDocumentNode.get('after');
                        localDocumentNode.remove();
                      }
                    }
                    rowIndex++;
                  }
                  if (columnCount < currentAlignmentLength) {
                    documentNode.set('align', documentNode.get('align').slice(0, columnCount));
                  } else {
                    documentNode.set(
                      'align',
                      documentNode
                        .get('align')
                        .concat([].repeat(null, columnCount - currentAlignmentLength)),
                    );
                  }
                  element.replaceWith(documentNode.toHTML());
                  if (inputEditor.lastCursor) {
                    inputEditor.undo.exeCommand(inputEditor.lastCursor);
                  } else {
                    window.getSelection().removeAllRanges();
                  }
                  receiver.showTableEdit(documentNode);
                  resizeCommand.redo.push(inputEditor.undo.buildReplaceUndo(documentNode));
                  inputEditor.undo.register(resizeCommand);
                });
            })(jquery(this).parent());
          }
          inputEvent.stopPropagation();
        })
        .on('click', '.marklyra-table-edit', function (inputEvent) {
          if (!jquery(inputEvent.target).closest('.md-table-resize-popover').length) {
            jquery('.md-table-resize-popover').remove();
            if (inputEditor.lastCursor && jquery('.md-table-resize-popover').length) {
              inputEditor.undo.exeCommand(inputEditor.lastCursor);
            }
          }
          inputEvent.stopPropagation();
        })
        .on('mousedown', '.marklyra-table-edit button', function () {
          File.editor.lastCursor = File.editor.selection.buildUndo() || File.editor.lastCursor;
        })
        .on('refocus', "[mdtype='table']", function () {
          console.debug('focuse on table');
          if (!jquery(document.activeElement).closest("[md-inline='image']").length) {
            receiver.showTableEdit(jquery(this));
          }
        })
        .on('mouseup', '.marklyra-table-edit', function (inputEvent) {
          inputEvent.stopPropagation();
        })
        .on('click', '.md-table-more', function () {
          jquery(File.editor.sessionStr).trigger('cursorChange');
          File.editor.lastCursor = File.editor.selection.buildUndo();
          File.editor.contextMenu.updateTableVisibility();
          File.editor.contextMenu.showExtMenu('#table-menu', jquery(this));
          this.focus();
        });
      (insertDialog = jquery('#table-insert-dialog'))
        .find('#table-insert-col, #table-insert-row')
        .off('keydown keypress keyup change')
        .on('keypress', function (keyboardEvent) {
          if (!/\d/.exec(String.fromCharCode(keyboardEvent.which))) {
            return false;
          }
        })
        .on('keydown', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Up' === map[keyCode]) {
            this.value = this.value - 0 + 1;
            this.value = Math.min(
              'table-insert-row' == this.getAttribute('id') ? maxRows : maxColumns,
              this.value,
            );
            return false;
          } else {
            if ('Down' === map[keyCode]) {
              this.value = this.value - 1;
              this.value = Math.max(1, this.value);
              return false;
            } else {
              return void ('ESC' === map[keyCode] && insertDialog.modal('hide'));
            }
          }
        })
        .on('keyup', function () {
          jquery(this).trigger('change');
        })
        .on('change', function () {
          receiver.updateInsertTableTouchBar();
        });
      insertDialog
        .find('#table-insert-col')
        .blur(function () {
          if (0 === jquery(this).val().trim().length) {
            jquery(this).val(2);
          }
          if (this.value > maxColumns) {
            this.value = maxColumns;
          } else {
            if (this.value < 1) {
              this.value = 1;
            }
          }
        })
        .on('keydown', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if (('Tab' === map[keyCode] && !event.ctrlKey) || 'Enter' === map[keyCode]) {
            insertDialog.find('#table-insert-row').focus();
            return false;
          }
        });
      insertDialog
        .find('#table-insert-row')
        .blur(function () {
          if (0 === jquery(this).val().trim().length) {
            jquery(this).val(1);
          }
          if (this.value > maxRows) {
            this.value = maxRows;
          } else {
            if (this.value < 1) {
              this.value = 1;
            }
          }
        })
        .on('keydown', function (keyboardEvent) {
          var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
          if ('Enter' === map[keyCode]) {
            insertDialog.find('.btn-primary').trigger('click');
          }
        });
      insertDialog.find('.btn-primary').click(function () {
        insertDialog.modal('hide');
        inputEditor.restoreLastCursor();
        jquery(File.editor.sessionStr).trigger('cursorChange');
        var documentNodeInstance = new DocumentNode({
          type: DocumentNode.TYPE.table,
          in: inputEditor.nodeMap,
        });
        TableEditor.verify(
          documentNodeInstance,
          insertDialog.find('#table-insert-col').val(),
          insertDialog.find('#table-insert-row').val(),
        );
        inputEditor.stylize.insertBlock(DocumentNode.TYPE.table, documentNodeInstance);
      });
      insertDialog.on('hidden.bs.modal', function () {
        if (File.isMac) {
          setTimeout(function () {
            documentMenu.refreshBlockMenu(null, true);
          }, 100);
        }
      });
      var tableElement,
        currentElement,
        localElement,
        currentTop,
        draggingRow,
        draggingColumn,
        currentLength,
        draggedColumnIndex,
        localLength,
        items,
        clientX,
        clientY,
        rowTracker,
        columnTracker,
        columnOffset = 0;
      function startRowDrag(pointerEvent) {
        if (!File.isLocked) {
          receiver.editor.focusCid = null;
          draggingRow = true;
          window.getSelection().removeAllRanges();
          showDragTracker();
          var rowHeight,
            rowCells = currentElement.children();
          jquery('#marklyra-table-row-tracker .marklyra-table-data-area')
            .html(
              ((rowHeight = currentElement.height()),
              currentElement.closest('thead').length
                ? "<table class='md-table' style='margin:0 ; padding:0; margin-left:0; height:" +
                  rowHeight +
                  "px;'><thead>" +
                  currentElement[0].outerHTML +
                  '</thead></table>'
                : "<table class='md-table' style='margin:0 ; padding:0; margin-left:0; height:" +
                  rowHeight +
                  "px;'><tbody>" +
                  currentElement[0].outerHTML +
                  '</tbody></table>'),
            )
            .find('td, th')
            .each(function (cellIndex) {
              this.style.width = rowCells[cellIndex].offsetWidth + 'px';
            });
          clientX = pointerEvent.offsetX;
          clientY = pointerEvent.offsetY;
          draggedColumnIndex = currentLength = currentElement.closest('thead').length
            ? 0
            : currentElement.prevAll().length + 1;
          items = [];
          var top = tableElement.offset().top,
            elements = currentElement.closest('table').find("[mdtype='table_row']");
          elements.each(function () {
            items.push(this.offsetTop + top);
          });
          if (elements.length < 2) {
            return false;
          } else {
            items.push(items.last() + tableElement.find('tbody tr:last-child')[0].offsetHeight);
            return false;
          }
        }
      }
      function startColumnDrag(pointerEvent) {
        if (!File.isLocked) {
          receiver.editor.focusCid = null;
          draggingColumn = true;
          window.getSelection().removeAllRanges();
          var columnCells = getColumnCells((draggedColumnIndex = currentLength = localLength)),
            offset = jquery(columnCells[0]).offset();
          jquery('#marklyra-table-col-tracker .marklyra-table-data-area')
            .offset(offset)
            .html(
              (function (columnCells) {
                var offsetWidth = localElement[0].offsetWidth;
                return (
                  "<table class='md-table' style='margin:0 ; padding:0; height:" +
                  tableElement.height() +
                  'px; width:' +
                  offsetWidth +
                  "px;'><thead><tr>" +
                  columnCells[0].outerHTML +
                  '</tr></thead><tbody>' +
                  columnCells
                    .toArray()
                    .map(function (item, itemIndex) {
                      if (itemIndex) {
                        return (
                          "<tr style='width:" +
                          item.offsetWidth +
                          'px; height:' +
                          item.offsetHeight +
                          "px;'>" +
                          item.outerHTML +
                          '</tr>'
                        );
                      } else {
                        return '';
                      }
                    })
                    .join('') +
                  '</tbody></table>'
                );
              })(columnCells),
            );
          showDragTracker(true);
          clientX = pointerEvent.offsetX;
          clientY = pointerEvent.offsetY;
          columnOffset = jquery('content').offset().left;
          items = [];
          var left = tableElement.offset().left;
          tableElement.find('thead:last-of-type th').each(function () {
            items.push(this.offsetLeft + left);
          });
          items.push(
            items.last() +
              tableElement.find("thead [mdtype='table_row'] th:last-child")[0].offsetWidth,
          );
        }
      }
      function updateDragPosition(pointerEvent) {
        if (draggingRow) {
          (function (pointerEvent) {
            if (!draggingRow) {
              return;
            }
            var insertionIndex;
            jquery('#marklyra-table-row-tracker').css(
              'top',
              pointerEvent.clientY -
                clientY -
                currentTop +
                document.querySelector('content').scrollTop,
            );
            if (
              (insertionIndex = items.findIndex(function (unusedParameter1, itemIndex) {
                return items[itemIndex] > pointerEvent.clientY;
              })) > 0
            ) {
              insertionIndex -= 1;
            }
            if (-1 == insertionIndex) {
              insertionIndex = items.length - 1;
            }
            if (currentLength != insertionIndex) {
              (function (targetRowIndex) {
                var offset;
                if (targetRowIndex >= items.length - 1) {
                  (offset = tableElement.find('tbody tr:last-child').offset()).top +=
                    tableElement.find('tbody tr:last-child')[0].offsetHeight;
                } else {
                  var targetRow = jquery(tableElement.find('tr[mdtype]')[targetRowIndex]);
                  if (targetRow[0] == currentElement[0] || !targetRow.length) {
                    return void hideInsertionMarker();
                  }
                  offset = targetRow.offset();
                }
                jquery('#marklyra-table-row-insert-marker')
                  .width(tableElement[0].offsetWidth)
                  .show()
                  .offset(offset);
              })((currentLength = insertionIndex));
            }
          })(pointerEvent);
        } else {
          if (draggingColumn) {
            (function (pointerEvent) {
              if (!draggingColumn) {
                return;
              }
              var insertionIndex;
              jquery('#marklyra-table-col-tracker').css(
                'left',
                pointerEvent.clientX - clientX - columnOffset,
              );
              var currentClientX = tableElement.scrollLeft();
              if (
                (insertionIndex = items.findIndex(function (unusedParameter1, itemIndex) {
                  return items[itemIndex] > pointerEvent.clientX + currentClientX;
                })) > 0
              ) {
                insertionIndex -= 1;
              }
              if (-1 == insertionIndex) {
                insertionIndex = items.length - 1;
              }
              if (currentLength != insertionIndex) {
                (function (targetColumnIndex) {
                  var offset;
                  if (targetColumnIndex >= items.length - 1) {
                    (offset = tableElement.offset()).left += tableElement[0].offsetWidth;
                  } else {
                    if (
                      draggedColumnIndex == targetColumnIndex ||
                      draggedColumnIndex + 1 == targetColumnIndex
                    ) {
                      return void hideInsertionMarker();
                    }
                    offset = getColumnCells(targetColumnIndex).offset();
                  }
                  tableElement.find('.marklyra-table-edit').remove();
                  jquery('#marklyra-table-col-insert-marker')
                    .height(tableElement[0].offsetHeight)
                    .show()
                    .offset(offset);
                })((currentLength = insertionIndex));
              }
            })(pointerEvent);
          }
        }
      }
      function hideInsertionMarker() {
        jquery('.marklyra-table-insert-marker').hide();
      }
      function showDragTracker(movingColumn) {
        jquery('#write').addClass('no-selection');
        if (movingColumn) {
          getColumnCells(localLength).addClass('marklyra-on-moving');
          jquery('#marklyra-table-row-tracker').hide();
        } else {
          currentElement.addClass('marklyra-on-moving');
          jquery('#marklyra-table-col-tracker').hide();
        }
      }
      function getColumnCells(columnIndex) {
        return tableElement.find("[mdtype='table_row']>*:nth-child(" + (columnIndex + 1) + ')');
      }
      function clearDragAppearance() {
        jquery('#write').removeClass('no-selection');
        jquery('content').removeClass('prevent-scroll');
        jquery('.marklyra-on-moving').removeClass('marklyra-on-moving');
        hideInsertionMarker();
      }
      function finishTableDrag(unusedParameter1) {
        if (draggingRow) {
          (function (inputUnusedParameter1) {
            if (!draggingRow) {
              return;
            }
            draggingRow = false;
            clearDragAppearance();
            clearDragTrackers();
            receiver.moveTableRow(draggedColumnIndex, currentLength, tableElement);
            resetDragState();
          })();
        } else {
          if (draggingColumn) {
            (function (inputUnusedParameter1) {
              if (!draggingColumn) {
                return;
              }
              draggingColumn = false;
              clearDragAppearance();
              clearDragTrackers();
              receiver.moveTableCol(draggedColumnIndex, currentLength, tableElement);
              receiver.showAlignCol(tableElement);
              resetDragState();
            })();
          }
        }
      }
      function resetDragState() {
        draggingRow = false;
        draggingColumn = false;
        tableElement = null;
        currentElement = null;
        localElement = null;
        draggedColumnIndex = null;
        currentLength = null;
      }
      setTimeout(function () {
        currentTop = jquery('content').offset().top;
      }, 200);
      rowTracker = jquery('#marklyra-table-row-tracker');
      columnTracker = jquery('#marklyra-table-col-tracker');
      jquery(inputEditor.sessionStr).on('mouseenter click', 'th, td', function (unusedParameter1) {
        if (0 != (localElement = jquery(this)).children('[mdtype]').length) {
          currentElement = localElement.closest('tr');
          tableElement = currentElement.closest("[mdtype='table']");
          localLength = localElement.prevAll().length;
          var offset = currentElement.offset(),
            currentOffset = localElement.offset(),
            localOffset = tableElement.offset();
          rowTracker
            .show()
            .offset(offset)
            .find('.marklyra-table-drag-area')
            .height(currentElement[0].offsetHeight + 1);
          currentOffset.top = localOffset.top;
          var tableWidth = tableElement.width();
          columnTracker
            .show()
            .offset(currentOffset)
            .find('.marklyra-table-drag-area')
            .width(
              Math.min(
                localElement[0].offsetWidth + 1,
                tableWidth - (localOffset.left - currentOffset.left) - 1,
              ),
            );
        }
      });
      jquery(document)
        .on('mousedown', '#marklyra-table-row-tracker', startRowDrag)
        .on('mousedown', '#marklyra-table-col-tracker', startColumnDrag)
        .on('mousemove', updateDragPosition)
        .on('mouseup', finishTableDrag);
    }
    updateInsertTableTouchBar() {
      if (File.isMac) {
        bridge.callHandler('touchBar.updateInsertTableTouchBar', [
          jquery('#table-insert-row').val() - 0,
          jquery('#table-insert-col').val() - 0,
        ]);
      }
    }
    moveTableRow(childIndex, inputChildIndex, tableOverride) {
      if (childIndex != inputChildIndex && childIndex + 1 != inputChildIndex) {
        tableOverride = tableOverride || this.editor.getMarkElem().closest("[mdtype='table']");
        var currentEditor = this.editor,
          selectionSnapshot = currentEditor.selection.buildUndo(),
          moveCommand = undoManager.makeEmptyCommand(selectionSnapshot),
          documentNode = currentEditor.findNodeByElem(tableOverride),
          childNode = documentNode.getNthChild(childIndex);
        currentEditor.undo.endSnap(true);
        moveCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
        DocumentNode.tryResetTable(documentNode);
        if (childIndex < --inputChildIndex) {
          inputChildIndex--;
        }
        childNode.detach();
        if (inputChildIndex >= 0) {
          documentNode.getNthChild(inputChildIndex).addAfter(childNode);
        } else {
          documentNode.getFirstChild().addBefore(childNode);
        }
        moveCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        tableOverride.replaceWith(documentNode.toHTML());
        if (selectionSnapshot) {
          currentEditor.undo.exeCommand(selectionSnapshot);
          moveCommand.redo.push(currentEditor.selection.buildUndo());
        }
        currentEditor.undo.register(moveCommand);
        this.showTableEdit(documentNode);
      }
    }
    moveTableCol(childIndex, inputChildIndex, tableOverride) {
      tableOverride = tableOverride || this.editor.getMarkElem().closest('.md-table');
      var currentEditor = this.editor,
        selectionSnapshot = currentEditor.selection.buildUndo(),
        moveCommand = undoManager.makeEmptyCommand(selectionSnapshot),
        documentNode = currentEditor.findNodeByElem(tableOverride),
        currentDocumentNode = documentNode.getFirstChild();
      currentEditor.undo.endSnap(true);
      if (childIndex != inputChildIndex && childIndex + 1 != inputChildIndex) {
        for (
          moveCommand.undo.push(undoManager.buildReplaceUndo(documentNode)),
            DocumentNode.tryResetTable(documentNode),
            childIndex < --inputChildIndex && inputChildIndex--;
          currentDocumentNode;
        ) {
          var childNode = currentDocumentNode.getNthChild(childIndex);
          childNode.detach();
          if (inputChildIndex >= 0) {
            currentDocumentNode.getNthChild(inputChildIndex).addAfter(childNode);
          } else {
            currentDocumentNode.getFirstChild().addBefore(childNode);
          }
          currentDocumentNode = currentDocumentNode.get('after');
        }
        var alignmentValue = documentNode.get('align').splice(childIndex, 1)[0];
        documentNode.get('align').splice(inputChildIndex + 1, 0, alignmentValue);
        if (documentNode.get('alignText')) {
          alignmentValue = documentNode.get('alignText').splice(childIndex, 1)[0];
          documentNode.get('alignText').splice(inputChildIndex + 1, 0, alignmentValue);
        }
        moveCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        tableOverride.replaceWith(documentNode.toHTML());
        if (selectionSnapshot) {
          currentEditor.undo.exeCommand(selectionSnapshot);
          moveCommand.redo.push(currentEditor.selection.buildUndo());
        }
        currentEditor.undo.register(moveCommand);
        this.showTableEdit(documentNode);
        console.debug('end move table col');
      } else {
        this.showTableEdit(documentNode);
      }
    }
    moveRowUpOrDown(moveUp) {
      var range = this.editor.selection.getRangy();
      if (range && !File.isLocked) {
        var tableRow = jquery(range.commonAncestorContainer)
          .closest("[mdtype='table_row']")
          .closest('tr');
        if (0 != tableRow.length) {
          var rowIndex = tableRow.closest('thead').length ? 0 : tableRow.prevAll().length + 1;
          if (
            !((moveUp && 0 == rowIndex) || (!moveUp && rowIndex && 0 == tableRow.nextAll().length))
          ) {
            this.moveTableRow(
              rowIndex,
              moveUp ? rowIndex - 1 : rowIndex + 2,
              tableRow.closest("[mdtype='table']"),
            );
            return true;
          }
        }
      }
    }
    moveColLeftOrRight(moveLeft) {
      var range = this.editor.selection.getRangy();
      if (range && !File.isLocked) {
        var tableCell = jquery(range.commonAncestorContainer)
          .closest("[mdtype='table_cell']")
          .closest('td, th');
        if (0 != tableCell.length) {
          var length = tableCell.prevAll().length;
          if (!((moveLeft && 0 == length) || (!moveLeft && 0 == tableCell.nextAll().length))) {
            this.moveTableCol(
              length,
              moveLeft ? length - 1 : length + 2,
              tableCell.closest("[mdtype='table']"),
            );
            return true;
          }
        }
      }
    }
    insertTable() {
      if (!(File.isLocked || document.body.classList.contains('modal-open'))) {
        this.editor.lastCursor =
          this.editor.selection.buildUndo() || this.editor.selection.selectionBeforeBlur;
        jquery('#table-insert-dialog').modal({ keyboard: true });
        if (File.isMac) {
          bridge.callHandler('touchBar.showInsertTableTouchBar');
        }
        setTimeout(function () {
          jquery('#table-insert-col').focus();
        }, 500);
      }
    }
    resizeTableEdit(tableElement) {
      var editToolbar = tableElement.parent().children('.marklyra-table-edit'),
        bounds = tableElement.parent()[0].getBoundingClientRect(),
        toolbarBounds = editToolbar.length && editToolbar[0].getBoundingClientRect();
      if (editToolbar.length) {
        editToolbar[0].style.marginTop = '-' + toolbarBounds.height + 'px';
        editToolbar[0].style.width = bounds.width + 10 + 'px';
      }
    }
    showTableEdit(nodeOrElement) {
      var tableNode = nodeOrElement,
        tableElement = nodeOrElement;
      function buildTableControls(unusedParameter1) {
        var textParts = [],
          alignLeftLabel = jquery.localize.getString('Align Left'),
          alignCenterLabel = jquery.localize.getString('Align Center'),
          alignRightLabel = jquery.localize.getString('Align Right'),
          resizeLabel = jquery.localize.getString('Resize Table'),
          deleteLabel = jquery.localize.getString('Delete Table'),
          moreLabel = jquery.localize.getString('More Actions', 'Menu'),
          alignmentButtons =
            '<span class="btn-group btn-group-xs md-align-gp"><button type="button" class="btn btn-default md-align-left" marklyra-hint="' +
            alignLeftLabel +
            '" aria-label="' +
            alignLeftLabel +
            '"><span class="marklyra-icon marklyra-left-alignment"></span></button><button type="button" class="btn btn-default md-align-center" marklyra-hint="' +
            alignCenterLabel +
            '" aria-label="' +
            alignCenterLabel +
            '"><span class="marklyra-icon marklyra-justify-align"></span></button><button type="button" class="btn btn-default md-align-right" marklyra-hint="' +
            alignRightLabel +
            '" aria-label="' +
            alignRightLabel +
            '"><span class="marklyra-icon marklyra-right-alignment"></span></button></span>';
        textParts.push(
          "<div class='marklyra-table-edit md-table-edit md-tooltip-remove' contenteditable='false'>",
        );
        textParts.push(
          '<span class="md-th-button btn-group-xs md-resize-table-th"><button type="button" class="btn btn-default md-resize-table" marklyra-hint="' +
            resizeLabel +
            '" aria-label="' +
            resizeLabel +
            '"><span class="marklyra-icon marklyra-menu"></span></button></span>',
        );
        textParts.push(alignmentButtons);
        textParts.push(
          '<span class="md-th-button right-th-button btn-group-xs"><button type="button" class="btn btn-default md-delete-table" marklyra-hint="' +
            deleteLabel +
            '" aria-label="' +
            deleteLabel +
            '"><span class="marklyra-icon marklyra-delete"></span></button></span>',
        );
        textParts.push(
          '<span class="md-th-button right-th-button"><button type="button" class="btn btn-default md-table-more" aria-label="' +
            moreLabel +
            '"><span class="md-table-more-label">' +
            moreLabel +
            '</span><span class="marklyra-icon marklyra-dots-v" style="margin-left:8px;"></span></button></span>',
        );
        textParts.push('</div>');
        return textParts.join('');
      }
      if (nodeOrElement.jquery) {
        tableNode = this.editor.findNodeByElem(nodeOrElement);
      } else {
        tableElement = this.editor.findElemById(tableNode.id);
      }
      if (tableElement.children('.md-table').length) {
        tableElement = tableElement.children('.md-table');
      }
      if (!tableElement.prev('.marklyra-table-edit').length) {
        jquery('.marklyra-table-edit').remove();
        buildTableControls();
        tableElement.before(buildTableControls());
      }
      this.resizeTableEdit(tableElement);
      this.showAlignCol(tableElement);
    }
    showAlignCol(element) {
      var range = this.editor.selection.getRangy(),
        selectedCell = range && jquery(range.commonAncestorContainer).closest('td, th');
      if (selectedCell && selectedCell.length) {
        if (!File.isMac) {
          jquery('.md-table-more').show();
        }
        var alignment = this.editor.findNodeByElem(element.closest('[cid]')).get('align'),
          length = selectedCell.prevAll().length;
        !(function (columnIndex, alignment) {
          var currentElement = element.closest('figure').find('.md-align-gp').show();
          currentElement.find('button').removeClass('active');
          currentElement.attr('data-col', columnIndex);
          if (!('left' !== alignment && 'right' !== alignment && 'center' !== alignment)) {
            currentElement.find('.md-align-' + alignment).addClass('active');
          }
        })(length, alignment[length]);
      } else {
        jquery('.md-table-more').hide();
      }
    }
    keydownHandler(keyboardEvent) {
      var keyCode = keyboardEvent.keyCode || keyboardEvent.which;
      if ('Tab' === map[keyCode] && !keyboardEvent.ctrlKey) {
        this.moveToNextCell(true, keyboardEvent.shiftKey, void 0, true);
        return false;
      }
      if ('Enter' === map[keyCode]) {
        var searchValue = this.editor.UserOp.backspaceHandler(this.editor, null, 'delSelection');
        if (keyboardEvent.shiftKey) {
          this.editor.UserOp.pasteHandler(this.editor, '<br />', true);
        } else {
          if (File.isMacOrMacNode ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) {
            var insertCommand = this.addRow(
              false,
              this.editor.undo.commandStack.indexOf(searchValue) > -1,
            );
            undoManager.append(searchValue, insertCommand);
          } else {
            this.moveToBelowCell(undoManager.isEmptyCommand(searchValue));
          }
        }
        return false;
      }
    }
    moveToNextCell(selectContents, backward, checkCellBoundary, appendRow) {
      try {
        var element,
          range = this.editor.selection.getRangy(),
          currentCell = this.editor
            .getMarkElem(backward ? range.startContainer : range.endContainer)
            .closest("[mdtype='table_cell']")
            .parent(),
          nextCell = (backward ? currentCell.prev() : currentCell.next()).children(
            "[mdtype='table_cell']",
          ),
          selection = this.editor.selection;
        if (checkCellBoundary) {
          var cellBookmark = range.getBookmark(currentCell[0]);
          if (backward && cellBookmark.start > 0) {
            if (selectContents) {
              selection.extendToLineEdge(false, currentCell[0]);
            } else {
              selection.jumpIntoElemBegin(currentCell);
            }
            this.editor.refocus();
            return true;
          }
          if (!backward && cellBookmark.end < currentCell.text().length) {
            if (selectContents) {
              selection.extendToLineEdge(true, currentCell[0]);
            } else {
              selection.jumpIntoElemEnd(currentCell);
            }
            this.editor.refocus();
            return true;
          }
        }
        if (!nextCell.length && currentCell.length) {
          element = currentCell.parent();
          if (
            !(nextCell = (
              backward ? element.prev().children(':last') : element.next().children(':first')
            ).children("[mdtype='table_cell']")).length
          ) {
            if (backward && 'TD' === currentCell[0].tagName) {
              nextCell = element.closest('table').find("thead>tr>th:last>[mdtype='table_cell']");
            } else {
              if (!(backward || 'TH' !== currentCell[0].tagName)) {
                nextCell = element
                  .closest('table')
                  .find("tbody>tr:first>td:first>[mdtype='table_cell']");
              }
            }
          }
        }
        nextCell.focus();
        if (nextCell.length) {
          if (selectContents) {
            if (checkCellBoundary) {
              var currentRange = this.editor.selection.extendToLineEdge(
                !backward,
                nextCell[0],
                true,
              );
              if (backward) {
                range.setStart(currentRange.startContainer, currentRange.startOffset);
              } else {
                range.setEnd(currentRange.endContainer, currentRange.endOffset);
              }
              this.editor.selection.setRange(range);
            } else {
              this.editor.selection.selectAllElem(nextCell);
            }
          } else {
            if (backward) {
              this.editor.selection.jumpIntoElemEnd(nextCell);
            } else {
              this.editor.selection.jumpIntoElemBegin(nextCell);
            }
          }
          this.editor.refocus();
          return true;
        }
        if (appendRow) {
          this.addRow();
          return true;
        }
      } catch (error) {}
    }
    moveToBelowCell(selectContents, direction, unusedParameter3) {
      try {
        var element = this.editor
            .getMarkElem(window.getSelection().anchorNode)
            .closest("[mdtype='table_cell']"),
          currentCell = this.editor.findNodeByElem(element),
          targetCell = TableEditor.getNextCellInColumn(currentCell, direction),
          targetElement = targetCell && this.editor.findElemById(targetCell.cid);
        if (targetCell) {
          if (targetElement.length) {
            if (selectContents) {
              this.editor.selection.selectAllElem(targetElement);
            } else {
              if (direction) {
                this.editor.selection.jumpIntoElemEnd(targetElement);
              } else {
                this.editor.selection.jumpIntoElemBegin(targetElement);
              }
            }
          }
        } else {
          this.editor.selection.moveUpOrDown();
        }
      } catch (error) {}
    }
    getSibling(node, direction, stayInRow) {
      return TableEditor.getSibling(node, direction, stayInRow);
    }
    unfocusAll(animate) {
      if (animate) {
        jquery('.marklyra-table-edit').fadeOut(function () {
          jquery('.marklyra-table-edit').remove();
        });
      } else {
        jquery('.marklyra-table-edit').remove();
      }
      jquery('.marklyra-table-tracker').hide();
    }
    deleteRow() {
      TableEditor.deleteRow(this.editor);
    }
    addRow(insertBefore, deferRegistration) {
      return TableEditor.addRow(this.editor, insertBefore, deferRegistration);
    }
    deleteCol() {
      TableEditor.deleteCol(this.editor);
    }
    addCol(insertBefore) {
      TableEditor.addCol(this.editor, insertBefore);
    }
    copyTable() {
      var element = this.editor
        .getMarkElem(window.getSelection().anchorNode)
        .closest('.md-table-fig');
      if (element.length) {
        (element = element.clone()).find('.md-tooltip-remove').remove();
        element.find('td, th').attr('style', function (unusedParameter1, unusedParameter2) {
          return (
            'border: 1px solid rgb(204, 204, 204);min-height:1ch;min-width:4ch;' +
            (this.style.textAlign ? 'text-align:' + this.style.textAlign + ';' : '')
          );
        });
        var tableHtml = element.html(),
          clipboardHtml = this.editor.UserOp.prepMarkHtml(element[0].outerHTML, editor),
          markdownSource = this.editor.UserOp.getMarkdownSourceFrom(clipboardHtml.html());
        this.editor.UserOp.setClipboard(tableHtml, clipboardHtml.html(), markdownSource, true);
      }
    }
    deleteTable(element, deferRegistration) {
      clearDragTrackers();
      jquery('#marklyra-tooltip').hide();
      if (
        (element =
          element ||
          editor.getMarkElem(window.getSelection().anchorNode).closest("[mdtype='table']")).attr(
          'cid',
        )
      ) {
        this.editor.undo.endSnap(true);
        var documentNode = this.editor.getNode(element.attr('cid')),
          deleteCommand = editor.undo.UndoManager.makeEmptyCommand(
            this.editor.selection.buildUndo(),
          ),
          nextNode = documentNode.get('after'),
          previousNode = documentNode.get('before');
        if (nextNode || previousNode) {
          undoManager.addUndoForRemove(deleteCommand, documentNode);
          documentNode.remove();
          element.remove();
        } else {
          deleteCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
          documentNode.set('type', NodeType.paragraph);
          documentNode.set('text', '');
          documentNode.clearChildren();
          element.replaceWith(documentNode.toHTML());
          deleteCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        }
        editor.focusCid = null;
        if (nextNode) {
          this.editor.selection.jumpIntoElemBegin(this.editor.findElemById(nextNode.id));
        } else {
          this.editor.selection.jumpIntoElemEnd(
            this.editor.findElemById((previousNode || documentNode).id),
          );
        }
        this.editor.lastCursor = null;
        deleteCommand.redo.push(this.editor.selection.buildUndo());
        if (!deferRegistration) {
          this.editor.undo.register(deleteCommand);
        }
        return deleteCommand;
      }
    }
    isTableEmpty(documentNode) {
      function isEmptyTableRow(inputDocumentNode) {
        for (
          var cellIndex = 0, childrenLength = inputDocumentNode.get('children').length;
          cellIndex < childrenLength;
          cellIndex++
        ) {
          if (inputDocumentNode.get('children').at(cellIndex).get('text')) {
            return false;
          }
        }
        return true;
      }
      for (
        var rowIndex = 0, currentChildrenLength = documentNode.get('children').length;
        rowIndex < currentChildrenLength;
        rowIndex++
      ) {
        if (!isEmptyTableRow(documentNode.get('children').at(rowIndex))) {
          return false;
        }
      }
      return true;
    }
    reformatTable(element) {
      if (
        (element =
          element ||
          editor.getMarkElem(window.getSelection().anchorNode).closest("[mdtype='table']")).length
      ) {
        editor.undo.endSnap(true);
        var documentNode = this.editor.getNode(element.attr('cid')),
          reformatCommand = editor.undo.UndoManager.makeEmptyCommand(
            this.editor.selection.buildUndo(),
          );
        reformatCommand.undo.push(undoManager.buildReplaceUndo(documentNode));
        documentNode.set('userText', void 0);
        documentNode.set('style', void 0);
        documentNode.set('alignText', void 0);
        for (var currentDocumentNode = documentNode.getFirstChild(); currentDocumentNode; ) {
          for (var localDocumentNode = currentDocumentNode.getFirstChild(); localDocumentNode; ) {
            localDocumentNode.set('marginRight', void 0);
            localDocumentNode.set('marginLeft', void 0);
            localDocumentNode = localDocumentNode.get('after');
          }
          currentDocumentNode = currentDocumentNode.get('after');
        }
        reformatCommand.redo.push(undoManager.buildReplaceUndo(documentNode));
        reformatCommand.redo.push(this.editor.selection.buildUndo());
        this.editor.undo.register(reformatCommand);
      }
    }
  }

  function clearDragTrackers() {
    jquery('#marklyra-table-row-tracker, #marklyra-table-col-tracker')
      .hide()
      .find('.marklyra-table-data-area')
      .html('');
  }
  TableEditor.deleteRow = function (editorInstance) {
    editorInstance.undo.endSnap(true);
    jquery('.md-tooltip-hide').hide();
    var deleteCommand,
      parentNode,
      range,
      tableCell = editorInstance.getMarkElem(window.getSelection().anchorNode).closest('td,th'),
      tableRow = editorInstance
        .getMarkElem(window.getSelection().anchorNode)
        .closest("tr[mdtype='table_row']"),
      length = tableRow.prevAll().length,
      documentNode = editorInstance.findNodeByElem(tableRow);
    if (documentNode && (documentNode.get('before') || documentNode.get('after'))) {
      parentNode = documentNode.get('parent');
      (deleteCommand = editorInstance.undo.UndoManager.makeEmptyCommand()).undo.push(
        editorInstance.selection.buildUndo(),
      );
      deleteCommand.undo.push(editorInstance.undo.UndoManager.buildReplaceUndo(parentNode));
      DocumentNode.tryResetTable(parentNode);
      var isFirstRow = !documentNode.get('before');
      if (!documentNode.get('after')) {
        length--;
      }
      documentNode.remove();
      deleteCommand.redo.push(editorInstance.undo.UndoManager.buildReplaceUndo(parentNode));
      editorInstance.findElemById(parentNode.id).replaceWith(parentNode.toHTML());
      range = document.createRange();
      try {
        if (isFirstRow || length < 0) {
          range.setStart(
            editorInstance
              .findElemById(parentNode.id)
              .find('thead th:nth-child(' + (tableCell.prevAll().length + 1) + ')>span')[0],
            0,
          );
        } else {
          range.setStart(
            editorInstance
              .findElemById(parentNode.id)
              .find(
                'tbody>tr:nth-child(' +
                  (length + 1) +
                  ')>td:nth-child(' +
                  (tableCell.prevAll().length + 1) +
                  ')>span',
              )[0],
            0,
          );
        }
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        deleteCommand.redo.push(editorInstance.selection.buildUndo());
      } catch (error) {}
      editorInstance.undo.register(deleteCommand);
      editorInstance.tableEdit.showTableEdit(parentNode);
    }
  };
  TableEditor.addRow = function (editorInstance, insertBefore, deferRegistration) {
    editorInstance.undo.endSnap(true);
    jquery('.md-tooltip-hide').hide();
    var documentNode,
      currentDocumentNode,
      tableRow = editorInstance
        .getMarkElem(window.getSelection().anchorNode)
        .closest("tr[mdtype='table_row']"),
      isBodyRow = 'TBODY' == (tableRow.parent()[0] || {}).tagName,
      childIndex = isBodyRow ? tableRow.prevAll().length + 1 : 0,
      insertCommand = editorInstance.undo.UndoManager.makeEmptyCommand(),
      localDocumentNode = editorInstance.findNodeByElem(tableRow);
    if (!localDocumentNode) {
      return insertCommand;
    }
    documentNode = localDocumentNode.get('parent');
    insertCommand.undo.push(editorInstance.selection.buildUndo());
    insertCommand.undo.push(editorInstance.undo.UndoManager.buildReplaceUndo(documentNode));
    DocumentNode.tryResetTable(documentNode);
    currentDocumentNode = documentNode.getNthChild(childIndex);
    currentDocumentNode = TableEditor.newEmptyRowAfter(
      insertBefore ? currentDocumentNode.get('before') : currentDocumentNode,
      currentDocumentNode.get('children').length,
      documentNode,
      insertBefore ? currentDocumentNode : currentDocumentNode.get('after'),
    );
    if (isBodyRow) {
      tableRow[insertBefore ? 'before' : 'after'](currentDocumentNode.toHTML());
    } else {
      editorInstance.findElemById(documentNode.id).replaceWith(documentNode.toHTML());
    }
    var nodeElement = editorInstance.findElemById(currentDocumentNode.getFirstChild().id);
    editorInstance.selection.jumpIntoElemBegin(nodeElement);
    editorInstance.selection.scrollAdjust();
    insertCommand.redo.push(editorInstance.undo.UndoManager.buildReplaceUndo(documentNode));
    insertCommand.redo.push(editorInstance.selection.buildUndo());
    if (!deferRegistration) {
      editorInstance.undo.register(insertCommand);
    }
    editorInstance.tableEdit.showTableEdit(documentNode);
    return insertCommand;
  };
  TableEditor.addCol = function (editorInstance, insertBefore) {
    editorInstance.undo.endSnap(true);
    jquery('.md-tooltip-hide').hide();
    var insertCommand,
      currentDocumentNode,
      tableCell = editorInstance.getMarkElem(window.getSelection().anchorNode).closest('td, th'),
      nodeId = tableCell.find('[cid]').attr('cid'),
      length = tableCell.prevAll().length;
    if (tableCell.length) {
      currentDocumentNode = editorInstance
        .findNodeByElem(tableCell.children('[cid]'))
        .get('parent')
        .get('parent');
      (insertCommand = editorInstance.undo.UndoManager.makeEmptyCommand()).undo.push(
        editorInstance.selection.buildUndo(),
      );
      insertCommand.undo.push(
        editorInstance.undo.UndoManager.buildReplaceUndo(currentDocumentNode),
      );
      DocumentNode.tryResetTable(currentDocumentNode);
      currentDocumentNode
        .get('children')
        .toArray()
        .map(function (documentNode) {
          var childNode = documentNode.getNthChild(length),
            documentNodeInstance = new DocumentNode({
              type: DocumentNode.TYPE.table_cell,
              text: '',
              marginLeft: childNode.get('marginLeft'),
              marginRight: childNode.get('marginRight'),
            });
          if (insertBefore) {
            childNode.addBefore(documentNodeInstance);
          } else {
            childNode.addAfter(documentNodeInstance);
          }
        });
      currentDocumentNode.get('align').splice(insertBefore ? length : length + 1, 0, null);
      if (currentDocumentNode.get('alignText')) {
        var alignmentText = DocumentNode.adjustAlignText(currentDocumentNode, 0, null);
        currentDocumentNode
          .get('alignText')
          .splice(insertBefore ? length : length + 1, 0, alignmentText);
      }
      editorInstance.findElemById(currentDocumentNode.id).replaceWith(currentDocumentNode.toHTML());
      tableCell = editorInstance.findElemById(nodeId).closest('th, td');
      editorInstance.selection.jumpIntoElemBegin(
        insertBefore ? tableCell.prev() : tableCell.next(),
      );
      insertCommand.redo.push(
        editorInstance.undo.UndoManager.buildReplaceUndo(currentDocumentNode),
      );
      editorInstance.undo.register(insertCommand);
      editorInstance.tableEdit.showTableEdit(currentDocumentNode);
    }
  };
  TableEditor.deleteCol = function (editorInstance) {
    editorInstance.undo.endSnap(true);
    jquery('.md-tooltip-hide').hide();
    var deleteCommand,
      currentDocumentNode,
      tableCell = editorInstance.getMarkElem(window.getSelection().anchorNode).closest('td, th'),
      length = tableCell.prevAll().length,
      currentLength = tableCell.nextAll().length,
      tableRow = tableCell.closest('tr'),
      rowIndex = 'TBODY' == tableRow.parent()[0].tagName ? tableRow.prevAll().length + 1 : 0;
    if (length || currentLength) {
      currentDocumentNode = editorInstance
        .findNodeByElem(tableCell.children('[cid]'))
        .get('parent')
        .get('parent');
      (deleteCommand = editorInstance.undo.UndoManager.makeEmptyCommand()).undo.push(
        editorInstance.selection.buildUndo(),
      );
      deleteCommand.undo.push(
        editorInstance.undo.UndoManager.buildReplaceUndo(currentDocumentNode),
      );
      DocumentNode.tryResetTable(currentDocumentNode);
      currentDocumentNode
        .get('children')
        .toArray()
        .map(function (documentNode) {
          documentNode.getNthChild(length).remove();
        });
      currentDocumentNode.get('align').splice(length, 1);
      if (currentDocumentNode.get('alignText')) {
        currentDocumentNode.get('alignText').splice(length, 1);
      }
      editorInstance.findElemById(currentDocumentNode.id).replaceWith(currentDocumentNode.toHTML());
      var range = document.createRange();
      try {
        if (rowIndex) {
          range.setStart(
            editorInstance
              .findElemById(currentDocumentNode.id)
              .find(
                'tbody>tr:nth-child(' + rowIndex + ')>td:nth-child(' + (length + 1) + ')>span',
              )[0],
            0,
          );
        } else {
          range.setStart(
            editorInstance
              .findElemById(currentDocumentNode.id)
              .find('thead>tr[mdtype]>th:nth-child(' + (length + 1) + ')>span')[0],
            0,
          );
        }
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
        deleteCommand.redo.push(editorInstance.selection.buildUndo());
      } catch (error) {}
      deleteCommand.redo.push(
        editorInstance.undo.UndoManager.buildReplaceUndo(currentDocumentNode),
      );
      editorInstance.undo.register(deleteCommand);
      editorInstance.tableEdit.showTableEdit(currentDocumentNode);
    }
  };
  TableEditor.getSibling = function (inputDocumentNode, direction, stayInRow) {
    if (DocumentNode.isType(inputDocumentNode, DocumentNode.TYPE.table_cell)) {
      direction = direction || 'after';
      var siblingCell = inputDocumentNode.get(direction),
        documentNode = inputDocumentNode.get('parent').get(direction);
      if (!(siblingCell || !documentNode || stayInRow)) {
        siblingCell =
          'after' == direction ? documentNode.getFirstChild() : documentNode.getLastChild();
      }
      return siblingCell;
    }
  };
  TableEditor.getColumnIndex = function (documentNode) {
    if (documentNode.get('before')) {
      return 1 + TableEditor.getColumnIndex(documentNode.get('before'));
    } else {
      return 0;
    }
  };
  TableEditor.getCellAt = function (documentNode, columnIndex) {
    if (DocumentNode.isType(documentNode, DocumentNode.TYPE.table_row)) {
      for (var currentDocumentNode = documentNode.getFirstChild(); columnIndex > 0; ) {
        columnIndex--;
        currentDocumentNode = currentDocumentNode.get('after');
      }
      return currentDocumentNode;
    }
  };
  TableEditor.getNextCellInColumn = function (documentNode, direction, columnIndex) {
    if (DocumentNode.isType(documentNode, DocumentNode.TYPE.table_cell)) {
      columnIndex = columnIndex || TableEditor.getColumnIndex(documentNode);
      direction = direction || 'after';
      var adjacentRow = documentNode.get('parent').get(direction);
      if (adjacentRow) {
        return TableEditor.getCellAt(adjacentRow, columnIndex);
      } else {
        return void 0;
      }
    }
  };
  TableEditor.resizeRow = function (documentNode, columnCount) {
    var before,
      firstChild = documentNode.getFirstChild(),
      itemIndex = 0,
      currentDocumentNode = documentNode.get('before'),
      localDocumentNode = currentDocumentNode ? currentDocumentNode.getFirstChild() : null,
      parentNode = documentNode.get('parent');
    function normalizeAlignment(alignmentValue) {
      if (alignmentValue.length > 1) {
        return alignmentValue[0];
      } else {
        return alignmentValue;
      }
    }
    DocumentNode.tryResetTable(parentNode);
    for (
      var iterationCount = Math.max(columnCount, documentNode.get('children').length);
      itemIndex < iterationCount;
    ) {
      if (itemIndex < columnCount) {
        if (!firstChild) {
          firstChild = new DocumentNode({
            type: DocumentNode.TYPE.table_cell,
            in: documentNode.get('in'),
            parent: documentNode,
            before: before,
          });
          if (localDocumentNode && void 0 !== localDocumentNode.get('marginLeft')) {
            firstChild.set('marginLeft', normalizeAlignment(localDocumentNode.get('marginLeft')));
            firstChild.set('marginRight', normalizeAlignment(localDocumentNode.get('marginRight')));
          } else {
            if (!currentDocumentNode && before && void 0 !== before.get('marginLeft')) {
              firstChild.set('marginLeft', normalizeAlignment(before.get('marginLeft')));
              firstChild.set('marginRight', normalizeAlignment(before.get('marginRight')));
            }
          }
          if (parentNode.get('alignText') && !parentNode.get('alignText')[itemIndex]) {
            parentNode.get('alignText')[itemIndex] = DocumentNode.adjustAlignText(
              parentNode,
              0,
              null,
            );
          }
        }
        firstChild = (before = firstChild).get('after');
      } else {
        if (firstChild) {
          firstChild = (before = firstChild).get('after');
          before.remove();
        }
      }
      itemIndex++;
      if (localDocumentNode) {
        localDocumentNode = localDocumentNode.get('after');
      }
    }
  };
  TableEditor.newEmptyRowAfter = function (
    documentNode,
    columnCount,
    inputDocumentNode,
    followingRow,
  ) {
    var documentNodeInstance = new DocumentNode({
      type: DocumentNode.TYPE.table_row,
      in: inputDocumentNode.get('in'),
      parent: inputDocumentNode,
      before: documentNode,
      after: documentNode ? documentNode.get('after') : followingRow || null,
    });
    TableEditor.resizeRow(documentNodeInstance, columnCount);
    return documentNodeInstance;
  };
  TableEditor.verify = function (documentNode, inputDocumentNode, minimumRows, convertSingleCell) {
    var before;
    minimumRows = minimumRows || 1;
    if (void 0 === inputDocumentNode) {
      inputDocumentNode = (inputDocumentNode = documentNode.get('children').at(0))
        ? inputDocumentNode.get('children').length
        : 1;
    }
    if (convertSingleCell && 1 == documentNode.get('children').length && 1 == inputDocumentNode) {
      var currentDocumentNode = documentNode.get('children').at(0);
      if (currentDocumentNode.get('children').length) {
        convertSingleCell(documentNode, currentDocumentNode.get('children').at(0).get('text'));
      } else {
        convertSingleCell(documentNode, currentDocumentNode.get('text'));
      }
    } else {
      documentNode.get('children').map(function (callbackDocumentNode) {
        for (
          var childrenLength = callbackDocumentNode.get('children').length,
            currentChildrenLength = childrenLength;
          currentChildrenLength < inputDocumentNode;
          currentChildrenLength++
        ) {
          if (currentChildrenLength === childrenLength) {
            before = callbackDocumentNode.getLastChild();
          }
          before = new DocumentNode({
            type: DocumentNode.TYPE.table_cell,
            parent: callbackDocumentNode,
            in: callbackDocumentNode.get('in'),
            before: before,
            text: '',
          });
        }
      });
      for (
        var localChildrenLength = documentNode.get('children').length;
        localChildrenLength < minimumRows;
        localChildrenLength++
      ) {
        TableEditor.newEmptyRowAfter(
          documentNode.get('children').at(localChildrenLength - 1),
          inputDocumentNode,
          documentNode,
        );
      }
      if (!documentNode.get('align') && inputDocumentNode > 0) {
        documentNode.set('align', Array(inputDocumentNode - 0).fill());
      }
    }
  };
  DocumentNode.TableEdit = TableEditor;
  moduleRecord.exports = TableEditor;
}
