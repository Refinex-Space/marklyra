import { diffText, type Patch } from '@marklyra/editor-core';
import {
  readStructuralSource,
  type StructuralDocumentSource,
  type StructuralSourceLeaf,
} from './block-indent-source.js';
import type { PlainBlockRange } from './input-range.js';
import type { LegacyGlobals } from './legacy-types.js';
import { readMarkdownPolicy } from './policy-options.js';
import { projectTableCellDeletion, type TableCellDeletion } from './table-cell-source.js';
import { projectTableCellFormat, type TableCellFormat } from './table-format-source.js';
import { projectTableRowChange } from './table-row-projection.js';
import {
  readTableSourceRows,
  type TableRowAction,
  type TableSourceRows,
  tableRowPatches,
} from './table-row-source.js';

interface RootContext {
  kind: 'root';
  rows: TableSourceRows;
}
interface NestedContext {
  kind: 'nested';
  rows: TableSourceRows;
  scope: StructuralSourceLeaf;
  document: StructuralDocumentSource;
}
export type TableRowContext = RootContext | NestedContext;
export type TableEditAction = TableRowAction | TableCellDeletion | TableCellFormat;
const apply = (text: string, patches: readonly Patch[]) =>
  [...patches]
    .reverse()
    .reduce(
      (source, patch) => source.slice(0, patch.from) + patch.insert + source.slice(patch.to),
      text,
    );
function samePath(a: StructuralSourceLeaf, b: StructuralSourceLeaf): boolean {
  return (
    a.root === b.root &&
    a.contexts.length === b.contexts.length &&
    a.contexts.every((context, index) => {
      const other = b.contexts[index];
      return (
        other &&
        context.node === other.node &&
        context.parent === other.parent &&
        context.style === other.style &&
        context.checked === other.checked
      );
    })
  );
}
export function readTableRowContext(
  runtime: LegacyGlobals,
  target: Element,
  canonical?: string,
  blocks?: readonly PlainBlockRange[],
): TableRowContext | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (!editor || !file || editor.sourceView.inSourceMode || editor.isIME) return;
  const ending = file.useCRLF ? '\r\n' : '\n';
  try {
    // Retain the established root-table proof and cost. An unrelated unsupported
    // block elsewhere must not disable an otherwise proved root table operation.
    const root = readTableSourceRows(editor, target, ending);
    if (root) return { kind: 'root', rows: root };
    const id = target.closest('[mdtype="table"][cid]')?.getAttribute('cid');
    if (!id) return;
    const document = readStructuralSource(
      runtime,
      canonical ?? editor.getMarkdown(),
      ending,
      blocks,
      true,
    );
    const scope = document?.leaves.find((leaf) => leaf.node.cid === id && leaf.type === 'table');
    if (!document || !scope || scope.lines.length !== scope.body.length) return;
    const rows = readTableSourceRows(editor, target, ending, scope);
    if (!rows || scope.lines.length !== rows.rows.length + 1) return;
    return { kind: 'nested', rows, scope, document };
  } catch {
    return;
  }
}
function nestedPatches(
  before: NestedContext,
  after: NestedContext,
  rowId: string,
  action: TableEditAction,
  ending: string,
  desired: TableSourceRows,
  cellPatches?: readonly Patch[],
): readonly Patch[] | undefined {
  const index = before.rows.rows.findIndex((row) => row.id === rowId);
  if (
    index < 0 ||
    !samePath(before.scope, after.scope) ||
    before.scope.node !== after.scope.node ||
    before.document.leaves.length !== after.document.leaves.length ||
    before.document.leaves.some((leaf, i) => {
      const other = after.document.leaves[i];
      return (
        !other ||
        leaf.node !== other.node ||
        leaf.type !== other.type ||
        !samePath(leaf, other) ||
        (leaf !== before.scope &&
          (leaf.body.length !== other.body.length ||
            leaf.body.some((line, j) => line !== other.body[j])))
      );
    }) ||
    (typeof action === 'string' && !tableRowPatches(before.rows, desired, rowId, action, 0, ending))
  )
    return;
  const line = (context: NestedContext, row: number) =>
    context.scope.lines[row === 0 ? 0 : row + 1];
  const postLine = (row: number) => {
    const current = line(after, row),
      body = desired.rows[row]?.line;
    return current && body !== undefined ? { prefix: current.prefix, body } : undefined;
  };
  const patches: Patch[] = [];
  if (typeof action !== 'string') {
    if (!cellPatches || before.scope.lines.length !== after.scope.lines.length) return;
    let cursor = before.rows.prefix.length;
    for (const [index, body] of [
      before.rows.rows[0]?.line,
      before.rows.delimiter,
      ...before.rows.rows.slice(1).map((row) => row.line),
    ].entries()) {
      const current = before.scope.lines[index],
        next = after.scope.lines[index];
      if (body === undefined || !current || !next || current.prefix !== next.prefix) return;
      for (const patch of cellPatches)
        if (patch.from >= cursor && patch.to <= cursor + body.length)
          patches.push({
            from: current.from + current.prefix.length + patch.from - cursor,
            to: current.from + current.prefix.length + patch.to - cursor,
            insert: patch.insert,
          });
      cursor += body.length + ending.length;
    }
    if (patches.length !== cellPatches.length) return;
  } else if (action === 'up' || action === 'down') {
    const other = index + (action === 'up' ? -1 : 1);
    for (const at of [index, other].sort((a, b) => a - b)) {
      const old = line(before, at),
        next = postLine(at);
      if (!old || !next || old.prefix !== next.prefix) return;
      patches.push({ from: old.from + old.prefix.length, to: old.to, insert: next.body });
    }
  } else if (action === 'delete') {
    const current = line(before, index),
      previous = before.scope.lines[index],
      next = line(before, index + 1);
    if (index === 0 || !current || !previous) return;
    if (index === before.rows.rows.length - 1)
      patches.push({ from: previous.to, to: current.to, insert: '' });
    else {
      if (!next) return;
      patches.push({ from: current.from, to: next.from, insert: '' });
    }
  } else if (action === 'before' && index === 0) {
    const old = line(before, 0),
      first = postLine(0),
      demoted = postLine(1),
      delimiter = before.scope.lines[1],
      body = line(before, 1);
    if (!old || !first || !demoted || !delimiter || old.prefix !== first.prefix) return;
    patches.push({ from: old.from + old.prefix.length, to: old.to, insert: first.body });
    patches.push(
      body
        ? { from: body.from, to: body.from, insert: demoted.prefix + demoted.body + ending }
        : { from: delimiter.to, to: delimiter.to, insert: ending + demoted.prefix + demoted.body },
    );
  } else {
    const at = action === 'before' ? index : index + 1,
      inserted = postLine(at);
    if (!inserted) return;
    if (at === before.rows.rows.length) {
      const last = before.scope.lines.at(-1);
      if (!last) return;
      patches.push({
        from: last.to,
        to: last.to,
        insert: ending + inserted.prefix + inserted.body,
      });
    } else {
      const target = line(before, at);
      if (!target) return;
      patches.push({
        from: target.from,
        to: target.from,
        insert: inserted.prefix + inserted.body + ending,
      });
    }
  }
  return apply(before.document.canonical, patches) === normalizedTableDocument(after, desired)
    ? patches
    : undefined;
}
function normalizedTableDocument(context: NestedContext, rows: TableSourceRows): string {
  const first = rows.rows[0];
  if (!first) throw Error('Missing projected table header');
  const bodies = [first.line, rows.delimiter, ...rows.rows.slice(1).map((row) => row.line)];
  if (bodies.length !== context.scope.lines.length) throw Error('Invalid projected table shape');
  return apply(
    context.document.canonical,
    context.scope.lines.map((line, index) => ({
      from: line.from + line.prefix.length,
      to: line.to,
      insert: bodies[index] ?? '',
    })),
  );
}
interface TableRowEdit {
  base: string;
  patches: readonly Patch[];
  normalization?: { baseCanonical: string; patches: readonly Patch[]; canonical: string };
}
/** Arm only the current live table/row. Root rows use the existing exact span;
 * nested rows additionally prove ancestor identity and every untouched leaf. */
export function captureTableRowAction(
  runtime: LegacyGlobals,
  canonical: string,
  blocks: readonly PlainBlockRange[],
  rowId: string,
  action: TableEditAction,
  ending: string,
): ((next: string) => TableRowEdit | undefined) | undefined {
  const editor = runtime.editor,
    file = runtime.File;
  if (
    !editor ||
    !file ||
    file.isLocked ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    ending !== (file.useCRLF ? '\r\n' : '\n')
  )
    return;
  const matches = [...editor.writingArea.querySelectorAll('tr[mdtype="table_row"][cid]')].filter(
      (row) => row.getAttribute('cid') === rowId,
    ),
    target = matches[0];
  if (matches.length !== 1 || !target) return;
  const before = readTableRowContext(runtime, target, canonical, blocks);
  if (!before) return;
  const index = before.rows.rows.findIndex((row) => row.id === rowId);
  if (index < 0 || (action === 'delete' && index === 0)) return;
  const block =
    before.kind === 'root' ? blocks.find((block) => block.id === before.rows.id) : undefined;
  if (
    before.kind === 'root' &&
    (!block ||
      canonical.slice(block.from, block.to) !== block.text ||
      !block.text.startsWith(before.rows.mark) ||
      block.text.slice(before.rows.mark.length).split(ending).join('') !== '')
  )
    return;
  const node = editor.getNode(before.rows.id),
    map = editor.nodeMap,
    option = file.option,
    policy = JSON.stringify(readMarkdownPolicy(runtime));
  return (next) => {
    if (
      runtime.editor !== editor ||
      runtime.File !== file ||
      editor.nodeMap !== map ||
      file.option !== option ||
      editor.getNode(before.rows.id) !== node ||
      file.isLocked ||
      editor.isIME ||
      editor.sourceView.inSourceMode ||
      ending !== (file.useCRLF ? '\r\n' : '\n') ||
      policy !== JSON.stringify(readMarkdownPolicy(runtime))
    )
      return;
    const tables = [...editor.writingArea.querySelectorAll('[mdtype="table"][cid]')].filter(
        (table) => table.getAttribute('cid') === before.rows.id,
      ),
      table = tables[0];
    if (tables.length !== 1 || !table) return;
    const after = readTableRowContext(runtime, table, next);
    if (!after || after.kind !== before.kind) return;
    const projected =
      typeof action === 'string'
        ? projectTableRowChange(before.rows, after.rows, rowId, action, block?.from ?? 0, ending)
        : action.kind === 'format-cells'
          ? projectTableCellFormat(before.rows, after.rows, action, block?.from ?? 0, ending)
          : projectTableCellDeletion(before.rows, after.rows, action, block?.from ?? 0, ending);
    if (!projected) return;
    const patches =
      before.kind === 'nested' && after.kind === 'nested'
        ? nestedPatches(before, after, rowId, action, ending, projected.rows, projected.patches)
        : block
          ? projected.patches
          : undefined;
    if (!patches) return;
    const editCanonical = apply(canonical, patches);
    if (before.kind === 'root' && block) {
      const end = block.from + before.rows.mark.length;
      if (
        canonical.slice(0, block.from) + after.rows.mark + canonical.slice(end) !== next ||
        canonical.slice(0, block.from) + projected.rows.mark + canonical.slice(end) !==
          editCanonical
      )
        return;
    }
    return {
      base: canonical,
      patches,
      ...(editCanonical !== next
        ? {
            normalization: {
              baseCanonical: editCanonical,
              patches: diffText(editCanonical, next),
              canonical: next,
            },
          }
        : {}),
    };
  };
}
