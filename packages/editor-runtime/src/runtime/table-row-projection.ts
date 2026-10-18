import type { Patch } from '@marklyra/editor-core';
import { type TableRowAction, type TableSourceRows, tableRowPatches } from './table-row-source.js';

/** This is a serializer-coordinate projection, never a second raw edit. Every
 * changed row must keep its current cell identities, text and serialized marks;
 * only the independently matched padding around those marks may differ. */
export function projectTableRowChange(
  before: TableSourceRows,
  after: TableSourceRows,
  rowId: string,
  action: TableRowAction,
  offset: number,
  ending: string,
): { rows: TableSourceRows; patches: readonly Patch[] } | undefined {
  if (before.id !== after.id || before.prefix !== after.prefix || before.suffix !== after.suffix)
    return;
  const validRow = (row: TableSourceRows['rows'][number]) =>
    row.cells &&
    row.cells.length > 0 &&
    new Set(row.cells.map((cell) => cell.id)).size === row.cells.length &&
    row.cells.every(
      (cell) =>
        typeof cell.text === 'string' &&
        typeof cell.mark === 'string' &&
        !/[\r\n]/u.test(cell.mark) &&
        /^[ \t]*$/u.test(cell.left) &&
        /^[ \t]*$/u.test(cell.right),
    ) &&
    '|' + row.cells.map((cell) => cell.left + cell.mark + cell.right + '|').join('') === row.line;
  const sameRow = (a: TableSourceRows['rows'][number], b: TableSourceRows['rows'][number]) => {
    if (!a.cells && !b.cells) return a.line === b.line;
    if (!validRow(a) || !validRow(b) || a.cells?.length !== b.cells?.length) return false;
    return a.cells?.every((cell, index) => {
      const other = b.cells?.[index];
      return other && cell.id === other.id && cell.text === other.text && cell.mark === other.mark;
    });
  };
  if (before.alignment || after.alignment || before.delimiter !== after.delimiter) {
    const alignment = (delimiter: string) =>
      /^\|(?:[ \t]*:?-+:?[ \t]*\|)+$/u.test(delimiter)
        ? delimiter
            .slice(1, -1)
            .split('|')
            .map((value) => {
              const f = value.trim();
              return f.startsWith(':')
                ? f.endsWith(':')
                  ? 'center'
                  : 'left'
                : f.endsWith(':')
                  ? 'right'
                  : null;
            })
        : undefined;
    if (
      !before.alignment ||
      !after.alignment ||
      JSON.stringify(before.alignment) !== JSON.stringify(after.alignment) ||
      JSON.stringify(alignment(before.delimiter)) !== JSON.stringify(before.alignment) ||
      JSON.stringify(alignment(after.delimiter)) !== JSON.stringify(after.alignment)
    )
      return;
  }
  const oldRows = new Map(before.rows.map((row) => [row.id, row]));
  if (
    oldRows.size !== before.rows.length ||
    new Set(after.rows.map((row) => row.id)).size !== after.rows.length
  )
    return;
  const rows: TableSourceRows['rows'] = [];
  for (const row of after.rows) {
    const old = oldRows.get(row.id);
    if (old && !sameRow(old, row)) return;
    rows.push(old ?? row);
  }
  if (!rows[0]) return;
  const mark =
    before.prefix +
    [rows[0].line, before.delimiter, ...rows.slice(1).map((row) => row.line)].join(ending) +
    before.suffix;
  const projected: TableSourceRows = { ...after, rows, delimiter: before.delimiter, mark };
  const patches = tableRowPatches(before, projected, rowId, action, offset, ending);
  if (!patches) return;
  return { rows: projected, patches };
}
