import type { LegacyGlobals } from './legacy-types.js';
import { readTableRowContext } from './table-row-edit.js';
import type { TableSourceRows } from './table-row-source.js';

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

/** History children are collection order. Prove membership and linked relations
 * against the current table reader instead of treating array order as DOM order. */
export function matchesTableSnapshot(value: unknown, table: TableSourceRows): boolean {
  const seen = new Set<unknown>();
  const node = (
    json: unknown,
    id: string,
    type: string,
    parent?: string,
    before?: string | null,
    after?: string | null,
  ) => {
    if (
      !object(json) ||
      seen.has(json) ||
      json.id !== id ||
      !object(json.content) ||
      json.content.type !== type ||
      !Array.isArray(json.children) ||
      !object(json.relation)
    )
      return;
    seen.add(json);
    if (
      parent !== undefined &&
      (json.relation.parent_id !== parent ||
        json.relation.before_id !== before ||
        json.relation.after_id !== after)
    )
      return;
    return json;
  };
  const root = node(value, table.id, 'table');
  if (!root || !Array.isArray(root.children) || root.children.length !== table.rows.length)
    return false;
  for (const [index, row] of table.rows.entries()) {
    const matches = root.children.filter((json: unknown) => object(json) && json.id === row.id);
    const current = node(
      matches[0],
      row.id,
      'table_row',
      table.id,
      table.rows[index - 1]?.id ?? null,
      table.rows[index + 1]?.id ?? null,
    );
    if (
      matches.length !== 1 ||
      !current ||
      !Array.isArray(current.children) ||
      !row.cells ||
      current.children.length !== row.cells.length
    )
      return false;
    for (const [column, cell] of row.cells.entries()) {
      const matches = current.children.filter(
        (json: unknown) => object(json) && json.id === cell.id,
      );
      const currentCell = node(
        matches[0],
        cell.id,
        'table_cell',
        row.id,
        row.cells[column - 1]?.id ?? null,
        row.cells[column + 1]?.id ?? null,
      );
      if (
        matches.length !== 1 ||
        !currentCell ||
        !object(currentCell.content) ||
        currentCell.content.text !== cell.text ||
        !Array.isArray(currentCell.children) ||
        currentCell.children.length
      )
        return false;
    }
  }
  return true;
}

/** The shipped column commands register only a table replacement for Redo.
 * Append the actual successful post-command caret only to its exact new entry;
 * do not install a delayed DOM restore or alter unknown/pending history. */
export function captureTableRedoCursor(
  runtime: LegacyGlobals,
  target: Element,
): (() => boolean) | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file || file.isLocked || editor.isIME || editor.sourceView.inSourceMode) return;
  const before = readTableRowContext(runtime, target),
    index = editor.undo.index,
    prior = editor.undo.commandStack[index],
    map = editor.nodeMap,
    option = file.option;
  if (!before) return;
  return () => {
    if (
      runtime.editor !== editor ||
      runtime.File !== file ||
      file.option !== option ||
      editor.nodeMap !== map ||
      file.isLocked ||
      editor.isIME ||
      editor.sourceView.inSourceMode ||
      editor.undo.index !== index + 1 ||
      editor.undo.commandStack[index] !== prior
    )
      return false;
    const tables = [...editor.writingArea.querySelectorAll('[mdtype="table"][cid]')].filter(
        (t) => t.getAttribute('cid') === before.rows.id,
      ),
      table = tables[0],
      entry = editor.undo.commandStack[editor.undo.index],
      redo: unknown = entry && Reflect.get(entry, 'redo'),
      undo: unknown = entry && Reflect.get(entry, 'undo');
    if (
      tables.length !== 1 ||
      !table ||
      !Array.isArray(redo) ||
      redo.length !== 1 ||
      !Array.isArray(undo) ||
      undo.length !== 2
    )
      return false;
    const after = readTableRowContext(runtime, table),
      cursor = editor.selection.buildUndo(),
      oldReplace = undo.filter((c) => object(c) && c.type === 'replace'),
      oldCursor = undo.filter((c) => object(c) && c.type === 'cursor');
    if (
      !after ||
      after.kind !== before.kind ||
      !cursor ||
      cursor.type !== 'cursor' ||
      typeof cursor.id !== 'string' ||
      typeof cursor.start !== 'number' ||
      cursor.start !== cursor.end ||
      !Number.isSafeInteger(cursor.start) ||
      cursor.start < 0 ||
      oldReplace.length !== 1 ||
      oldCursor.length !== 1 ||
      !object(oldReplace[0]) ||
      oldReplace[0].id !== before.rows.id ||
      !matchesTableSnapshot(oldReplace[0].json, before.rows) ||
      !object(redo[0]) ||
      redo[0].type !== 'replace' ||
      redo[0].id !== before.rows.id ||
      !matchesTableSnapshot(redo[0].json, after.rows)
    )
      return false;
    const cell = after.rows.rows.flatMap((row) => row.cells ?? []).find((c) => c.id === cursor.id),
      selection = editor.writingArea.ownerDocument.getSelection(),
      element =
        selection?.anchorNode?.nodeType === 1
          ? (selection.anchorNode as Element)
          : selection?.anchorNode?.parentElement;
    if (
      !cell ||
      cursor.start > cell.text.length ||
      !selection?.isCollapsed ||
      selection.rangeCount !== 1 ||
      element?.closest('[mdtype="table_cell"][cid]')?.getAttribute('cid') !== cursor.id
    )
      return false;
    redo.push(structuredClone(cursor));
    return true;
  };
}
