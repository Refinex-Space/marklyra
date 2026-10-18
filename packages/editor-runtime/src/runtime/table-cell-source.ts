import { assertPosition, type Patch } from '@marklyra/editor-core';
import type { LegacyEditor } from './legacy-types.js';
import type { TableSourceRows } from './table-row-source.js';

export interface TableCellDeletion {
  kind: 'clear-cells';
  first: { id: string; offset: number };
  last: { id: string; offset: number };
}
export function captureTableCellSelection(
  editor: LegacyEditor,
): { rowId: string; action: TableCellDeletion } | undefined {
  const selection = editor.writingArea.ownerDocument.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed || editor.isIME) return;
  const range = selection.getRangeAt(0),
    element = (node: Node) => (node.nodeType === 1 ? (node as Element) : node.parentElement),
    first = element(range.startContainer)?.closest('[mdtype="table_cell"][cid]'),
    last = element(range.endContainer)?.closest('[mdtype="table_cell"][cid]'),
    rowId = first?.closest('tr[cid]')?.getAttribute('cid');
  if (
    !rowId ||
    !first ||
    !last ||
    first === last ||
    !editor.writingArea.contains(first) ||
    first.closest('[mdtype="table"][cid]') !== last.closest('[mdtype="table"][cid]')
  )
    return;
  const point = (cell: Element, node: Node, offset: number) => {
    const id = cell.getAttribute('cid'),
      prefix = cell.ownerDocument.createRange();
    if (!id || !cell.contains(node) || editor.getNode(id)?.get('text') !== cell.textContent) return;
    prefix.selectNodeContents(cell);
    prefix.setEnd(node, offset);
    return { id, offset: prefix.toString().length };
  };
  const start = point(first, range.startContainer, range.startOffset),
    end = point(last, range.endContainer, range.endOffset);
  return start && end
    ? { rowId, action: { kind: 'clear-cells', first: start, last: end } }
    : undefined;
}

/** Preserve each cell's old padding and the existing delimiter. Only a proved
 * linear deletion of plain source-equivalent cell bodies receives raw patches. */
export function projectTableCellDeletion(
  before: TableSourceRows,
  after: TableSourceRows,
  action: TableCellDeletion,
  offset: number,
  ending: string,
): { rows: TableSourceRows; patches: readonly Patch[] } | undefined {
  if (
    before.id !== after.id ||
    before.prefix !== after.prefix ||
    before.suffix !== after.suffix ||
    before.rows.length !== after.rows.length ||
    JSON.stringify(before.alignment) !== JSON.stringify(after.alignment)
  )
    return;
  const cells = before.rows.flatMap((row) => row.cells ?? []),
    first = cells.findIndex((cell) => cell.id === action.first.id),
    last = cells.findIndex((cell) => cell.id === action.last.id);
  if (first < 0 || last <= first || new Set(cells.map((c) => c.id)).size !== cells.length) return;
  const patches: Patch[] = [],
    rows: TableSourceRows['rows'] = [];
  let ordinal = 0,
    cursor = offset + before.prefix.length;
  for (const [index, row] of before.rows.entries()) {
    const next = after.rows[index];
    if (
      !row.cells?.length ||
      !next?.cells ||
      row.id !== next.id ||
      row.cells.length !== next.cells.length
    )
      return;
    let line = '|',
      position = cursor + 1;
    const projected = [];
    for (const [column, cell] of row.cells.entries()) {
      const value = next.cells[column],
        selected = ordinal >= first && ordinal <= last;
      if (!value || cell.id !== value.id) return;
      let expected = cell.text;
      if (selected) {
        const from = ordinal === first ? action.first.offset : 0,
          to = ordinal === last ? action.last.offset : cell.text.length;
        if (
          !Number.isSafeInteger(from) ||
          !Number.isSafeInteger(to) ||
          from < 0 ||
          to < from ||
          to > cell.text.length ||
          cell.text !== cell.mark ||
          cell.text !== cell.text.trim() ||
          value.text !== value.mark
        )
          return;
        try {
          assertPosition(cell.text, from);
          assertPosition(cell.text, to);
        } catch {
          return;
        }
        expected = cell.text.slice(0, from) + cell.text.slice(to);
        if (to > from)
          patches.push({
            from: position + cell.left.length + from,
            to: position + cell.left.length + to,
            insert: '',
          });
      }
      if (value.text !== expected || (!selected && value.mark !== cell.mark)) return;
      const fragment = cell.left + value.mark + cell.right + '|';
      projected.push({ ...cell, text: value.text, mark: value.mark });
      line += fragment;
      position += cell.left.length + cell.mark.length + cell.right.length + 1;
      ordinal++;
    }
    if ('|' + row.cells.map((c) => c.left + c.mark + c.right + '|').join('') !== row.line) return;
    rows.push({ ...row, line, cells: projected });
    cursor +=
      row.line.length + ending.length + (index === 0 ? before.delimiter.length + ending.length : 0);
  }
  const mark =
    before.prefix +
    [rows[0]?.line, before.delimiter, ...rows.slice(1).map((r) => r.line)].join(ending) +
    before.suffix;
  let replay = before.mark;
  for (const patch of [...patches].reverse())
    replay = replay.slice(0, patch.from - offset) + patch.insert + replay.slice(patch.to - offset);
  return patches.length && replay === mark
    ? { rows: { ...after, rows, delimiter: before.delimiter, mark }, patches }
    : undefined;
}
