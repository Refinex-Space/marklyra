import type { Patch } from '@marklyra/editor-core';
import type { StructuralSourceLeaf } from './block-indent-source.js';
import type { LegacyEditor, LegacyNode } from './legacy-types.js';
export type TableRowAction = 'before' | 'after' | 'delete' | 'up' | 'down';
export interface TableSourceCell {
  id: string;
  text: string;
  mark: string;
  left: string;
  right: string;
}
export interface TableSourceRows {
  id: string;
  mark: string;
  prefix: string;
  suffix: string;
  delimiter: string;
  rows: { id: string; line: string; cells?: readonly TableSourceCell[] }[];
  alignment?: readonly ('left' | 'center' | 'right' | null)[];
}
/** Read linked model order (collection.toArray is insertion order).
 * table_row.toMark is explicitly unsupported by the serializer. */
export function readTableSourceRows(
  editor: LegacyEditor,
  target: Element,
  ending: string,
  scope?: StructuralSourceLeaf,
): TableSourceRows | undefined {
  const table = target.closest<HTMLElement>('[mdtype="table"][cid]');
  if (!table || !editor.writingArea.contains(table)) return;
  const id = table.getAttribute('cid'),
    node = id ? editor.getNode(id) : undefined;
  if (!id || !node || node.get('type') !== 'table') return;
  if (
    scope
      ? scope.node !== node || scope.type !== 'table'
      : table.parentElement !== editor.writingArea || node.get('parent')
  )
    return;
  const mark = node.toMark();
  const children = (parent: LegacyNode, type: string): LegacyNode[] | undefined => {
    const found: LegacyNode[] = [],
      seen = new Set<LegacyNode>();
    let child = parent.getFirstChild();
    while (child) {
      if (
        seen.has(child) ||
        found.length >= 10_000 ||
        editor.getNode(child.cid) !== child ||
        child.get('type') !== type ||
        child.get('parent') !== parent
      )
        return;
      seen.add(child);
      found.push(child);
      child = child.get('after');
    }
    return found;
  };
  const rows = children(node, 'table_row'),
    domRows = [...table.querySelectorAll<HTMLElement>('tr[mdtype="table_row"][cid]')];
  if (!rows?.length || rows.length !== domRows.length) return;
  const parts = mark.split(ending);
  let leading = 0;
  while (parts[leading] === '') leading++;
  const body = parts.slice(leading, leading + rows.length + 1),
    tail = parts.slice(leading + rows.length + 1);
  if (tail.some((line) => line !== '') || body.length !== rows.length + 1) return;
  const lines: TableSourceRows['rows'] = [];
  let columns = -1;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index],
      dom = domRows[index];
    if (!row || !dom || row.cid !== dom.getAttribute('cid')) return;
    const cells = children(row, 'table_cell');
    if (!cells?.length || (columns >= 0 && columns !== cells.length)) return;
    columns = cells.length;
    const domCells = [...dom.querySelectorAll<HTMLElement>('[mdtype="table_cell"][cid]')];
    if (domCells.length !== cells.length) return;
    const line = body[index === 0 ? 0 : index + 1];
    if (!line?.startsWith('|')) return;
    let cursor = 1;
    const fields: TableSourceCell[] = [];
    for (let column = 0; column < cells.length; column++) {
      const cell = cells[column],
        view = domCells[column];
      if (!cell || !view || view.getAttribute('cid') !== cell.cid) return;
      const left = cell.get('marginLeft'),
        right = cell.get('marginRight'),
        text = cell.get('text');
      if (typeof text !== 'string') return;
      const read: unknown = Reflect.get(view, 'rawText');
      if (typeof read !== 'function' || Reflect.apply(read, view, [true]) !== text) return;
      const mark = cell.toMark().trim();
      if (/[\r\n]/.test(mark)) return;
      let actualLeft: string, actualRight: string;
      if (typeof left === 'string' && typeof right === 'string') {
        if (!/^[ \t]*$/u.test(left) || !/^[ \t]*$/u.test(right)) return;
        const fragment = left + mark + right + '|';
        if (!line.startsWith(fragment, cursor)) return;
        cursor += fragment.length;
        actualLeft = left;
        actualRight = right;
      } else if (left == null && right == null) {
        // New/explicitly formatted cells have no margin attributes. Match the
        // exact native root output, anchored by every current cell in order;
        // do not infer padding from DOM width or split escaped/code pipes.
        actualLeft = /^[ \t]*/u.exec(line.slice(cursor))?.[0] ?? '';
        cursor += actualLeft.length;
        if (!line.startsWith(mark, cursor)) return;
        cursor += mark.length;
        actualRight = /^[ \t]*/u.exec(line.slice(cursor))?.[0] ?? '';
        cursor += actualRight.length;
        if (line[cursor++] !== '|') return;
      } else return;
      fields.push({ id: cell.cid, text, mark, left: actualLeft, right: actualRight });
    }
    if (cursor !== line.length) return;
    lines.push({ id: row.cid, line, cells: fields });
  }
  const delimiter = body[1];
  if (
    !delimiter ||
    !/^\|(?:[ \t]*:?-+:?[ \t]*\|)+$/.test(delimiter) ||
    delimiter.split('|').length !== columns + 2
  )
    return;
  const alignment = delimiter
    .slice(1, -1)
    .split('|')
    .map((value) => {
      const field = value.trim();
      return field.startsWith(':')
        ? field.endsWith(':')
          ? ('center' as const)
          : ('left' as const)
        : field.endsWith(':')
          ? ('right' as const)
          : null;
    });
  const modelAlignment: unknown = Reflect.apply(node.get, node, ['align']);
  if (
    modelAlignment != null &&
    (!Array.isArray(modelAlignment) ||
      modelAlignment.length > columns ||
      modelAlignment.some((value) => value != null && !['left', 'right', 'center'].includes(value)))
  )
    return;
  if (
    alignment.some(
      (value, index) =>
        value !== ((Array.isArray(modelAlignment) ? modelAlignment[index] : null) ?? null),
    )
  )
    return;
  for (let index = 0; index < lines.length; index++)
    if (lines[index]?.line !== body[index === 0 ? 0 : index + 1]) return;
  if (
    scope &&
    (scope.body.length !== body.length || scope.body.some((line, index) => line !== body[index]))
  )
    return;
  const prefix = ending.repeat(leading),
    bodyText = body.join(ending),
    suffix = mark.slice(prefix.length + bodyText.length);
  if (mark !== prefix + bodyText + suffix) return;
  return { id, mark, prefix, suffix, delimiter, rows: lines, alignment };
}
/** Derive one exact splice from explicit row identity and unchanged serialized
 * neighbors. No substring search or unconstrained diff is used. */
export function tableRowSplice(
  before: TableSourceRows,
  after: TableSourceRows,
  rowId: string,
  action: Exclude<TableRowAction, 'up' | 'down'>,
  offset: number,
  ending: string,
): Patch | undefined {
  if (
    before.id !== after.id ||
    before.prefix !== after.prefix ||
    before.suffix !== after.suffix ||
    before.delimiter !== after.delimiter
  )
    return;
  const index = before.rows.findIndex((row) => row.id === rowId);
  if (index < 0 || (action === 'before' && index === 0) || (action === 'delete' && index === 0))
    return;
  const start = (rowIndex: number) =>
    offset +
    before.prefix.length +
    before.rows.slice(0, rowIndex).reduce((sum, row) => sum + row.line.length + ending.length, 0) +
    (rowIndex > 0 ? before.delimiter.length + ending.length : 0);
  const bodyEnd = offset + before.mark.length - before.suffix.length;
  if (action === 'delete') {
    if (after.rows.length !== before.rows.length - 1) return;
    const survivors = before.rows.filter((row) => row.id !== rowId);
    if (
      survivors.some((row, i) => row.id !== after.rows[i]?.id || row.line !== after.rows[i]?.line)
    )
      return;
    const from = index === before.rows.length - 1 ? start(index) - ending.length : start(index),
      to = index === before.rows.length - 1 ? bodyEnd : start(index + 1);
    return { from, to, insert: '' };
  }
  const at = action === 'before' ? index : index + 1,
    inserted = after.rows[at];
  if (
    !inserted ||
    after.rows.length !== before.rows.length + 1 ||
    before.rows.some((row) => row.id === inserted.id)
  )
    return;
  const survivors = after.rows.filter((row) => row !== inserted);
  if (before.rows.some((row, i) => row.id !== survivors[i]?.id || row.line !== survivors[i]?.line))
    return;
  return at === before.rows.length
    ? { from: bodyEnd, to: bodyEnd, insert: ending + inserted.line }
    : { from: start(at), to: start(at), insert: inserted.line + ending };
}
/** A header insertion promotes a new empty row and demotes the old header.
 * Keep the existing delimiter in place; two disjoint edits avoid rewriting it
 * with a canonical spelling or a different physical line ending. */
export function tableRowPatches(
  before: TableSourceRows,
  after: TableSourceRows,
  rowId: string,
  action: TableRowAction,
  offset: number,
  ending: string,
): readonly Patch[] | undefined {
  if (!Number.isSafeInteger(offset) || offset < 0 || !['\n', '\r\n'].includes(ending)) return;
  if (action === 'up' || action === 'down') {
    const index = before.rows.findIndex((row) => row.id === rowId),
      other = index + (action === 'up' ? -1 : 1);
    if (
      index < 0 ||
      other < 0 ||
      other >= before.rows.length ||
      before.id !== after.id ||
      before.prefix !== after.prefix ||
      before.suffix !== after.suffix ||
      before.delimiter !== after.delimiter ||
      before.rows.length !== after.rows.length
    )
      return;
    const order = [...before.rows];
    const selected = order[index],
      neighbor = order[other];
    if (!selected || !neighbor) return;
    [order[index], order[other]] = [neighbor, selected];
    if (order.some((row, i) => row.id !== after.rows[i]?.id || row.line !== after.rows[i]?.line))
      return;
    const start = (i: number) =>
      offset +
      before.prefix.length +
      before.rows.slice(0, i).reduce((sum, row) => sum + row.line.length + ending.length, 0) +
      (i ? before.delimiter.length + ending.length : 0);
    const patches: Patch[] = [];
    for (const i of [index, other].sort((a, b) => a - b)) {
      const old = before.rows[i],
        next = order[i];
      if (!old || !next) return;
      patches.push({ from: start(i), to: start(i) + old.line.length, insert: next.line });
    }
    return patches;
  }
  if (action !== 'before' || before.rows[0]?.id !== rowId) {
    const patch = tableRowSplice(before, after, rowId, action, offset, ending);
    return patch ? [patch] : undefined;
  }
  const header = before.rows[0],
    inserted = after.rows[0];
  if (
    !header ||
    !inserted ||
    before.id !== after.id ||
    before.prefix !== after.prefix ||
    before.suffix !== after.suffix ||
    before.delimiter !== after.delimiter ||
    after.rows.length !== before.rows.length + 1 ||
    before.rows.some((row) => row.id === inserted.id) ||
    !/^\|(?:[ \t]*\|)+$/u.test(inserted.line) ||
    inserted.line.split('|').length !== before.delimiter.split('|').length ||
    before.rows.some(
      (row, index) =>
        row.id !== after.rows[index + 1]?.id || row.line !== after.rows[index + 1]?.line,
    )
  )
    return;
  const start = offset + before.prefix.length,
    delimiterEnd = start + header.line.length + ending.length + before.delimiter.length;
  const atEnd = before.rows.length === 1,
    point = delimiterEnd + (atEnd ? 0 : ending.length);
  const patches: Patch[] = [
    { from: start, to: start + header.line.length, insert: inserted.line },
    { from: point, to: point, insert: atEnd ? ending + header.line : header.line + ending },
  ];
  let replay = before.mark;
  for (const patch of [...patches].reverse())
    replay = replay.slice(0, patch.from - offset) + patch.insert + replay.slice(patch.to - offset);
  return replay === after.mark ? patches : undefined;
}
