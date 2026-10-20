import type { Patch } from '@marklyra/editor-core';
import type { TableSourceRows } from './table-row-source.js';

export interface TableCellFormat {
  kind: 'format-cells';
  cells: readonly { id: string; before: string; after: string }[];
}

/** Only named cell bodies may change. Keep every delimiter, margin, identity and
 * untouched cell, even if the native serializer recomputes column padding. */
export function projectTableCellFormat(
  before: TableSourceRows,
  after: TableSourceRows,
  action: TableCellFormat,
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
  const changes = new Map(action.cells.map((cell) => [cell.id, cell]));
  if (!changes.size || changes.size !== action.cells.length) return;
  const patches: Patch[] = [],
    rows: TableSourceRows['rows'] = [];
  let cursor = offset + before.prefix.length;
  for (const [rowIndex, row] of before.rows.entries()) {
    const next = after.rows[rowIndex];
    if (
      !next ||
      row.id !== next.id ||
      !row.cells ||
      !next.cells ||
      row.cells.length !== next.cells.length
    )
      return;
    let line = '|',
      position = cursor + 1;
    const cells = [];
    for (const [column, cell] of row.cells.entries()) {
      const value = next.cells[column],
        change = changes.get(cell.id);
      if (!value || value.id !== cell.id) return;
      if (change) {
        if (
          cell.text !== change.before ||
          cell.mark !== change.before ||
          value.text !== change.after ||
          value.mark !== change.after ||
          /[\r\n]/u.test(change.after)
        )
          return;
        changes.delete(cell.id);
        patches.push({
          from: position + cell.left.length,
          to: position + cell.left.length + cell.mark.length,
          insert: change.after,
        });
      } else if (cell.text !== value.text || cell.mark !== value.mark) return;
      cells.push({ ...cell, text: value.text, mark: value.mark });
      line += cell.left + value.mark + cell.right + '|';
      position += cell.left.length + cell.mark.length + cell.right.length + 1;
    }
    if (
      '|' + row.cells.map((cell) => cell.left + cell.mark + cell.right + '|').join('') !==
      row.line
    )
      return;
    rows.push({ ...row, line, cells });
    cursor +=
      row.line.length +
      ending.length +
      (rowIndex === 0 ? before.delimiter.length + ending.length : 0);
  }
  if (changes.size) return;
  const mark =
    before.prefix +
    [rows[0]?.line, before.delimiter, ...rows.slice(1).map((row) => row.line)].join(ending) +
    before.suffix;
  let replay = before.mark;
  for (const patch of [...patches].reverse())
    replay = replay.slice(0, patch.from - offset) + patch.insert + replay.slice(patch.to - offset);
  if (replay !== mark) return;
  return { rows: { ...after, rows, delimiter: before.delimiter, mark }, patches };
}
