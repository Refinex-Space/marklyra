import type { CursorBookmark } from '../protocol.js';
import type { LegacyGlobals, LegacyNode } from './legacy-types.js';
import type { TableAxis } from './table-controls-actions.js';
import { projectTableCellFormat, type TableCellFormat } from './table-format-source.js';
import { readTableRowContext } from './table-row-edit.js';

function raw(node: Node): string {
  if (node.nodeType === 3) return node.textContent ?? '';
  const reader = Reflect.get(node, 'rawText');
  if (typeof reader !== 'function') return node.textContent ?? '';
  const value: unknown = Reflect.apply(reader, node, [true]);
  if (typeof value !== 'string') throw Error('无法读取单元格的原始内容');
  return value;
}

/** Remove only strong markers recognized by the existing renderer, with exact
 * source concatenation proofs. Code, URLs and opaque inline tokens stay intact. */
function withoutStrong(node: Node): string {
  const source = raw(node);
  if (node instanceof Element && node.matches('[md-inline="strong"]')) {
    const before = node.querySelector(':scope > .md-before');
    const after = node.querySelector(':scope > .md-after');
    const body = node.querySelector(':scope > strong');
    const marker = before && raw(before);
    if (
      body &&
      after &&
      (marker === '**' || marker === '__') &&
      raw(after) === marker &&
      marker + raw(body) + marker === source
    )
      return withoutStrong(body);
  }
  const children = [...node.childNodes];
  return children.length && children.map(raw).join('') === source
    ? children.map(withoutStrong).join('')
    : source;
}

function emphasis(field: Element): { text: boolean; bold: boolean } {
  const walker = field.ownerDocument.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  let text = false,
    bold = true;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (!node.textContent?.trim() || parent?.closest('.md-meta,.md-content')) continue;
    text = true;
    if (!parent?.closest('strong')) bold = false;
  }
  return { text, bold: text && bold };
}

export function tableHeadingPlan(
  runtime: LegacyGlobals,
  target: HTMLTableCellElement,
  axis: TableAxis,
): (TableCellFormat & { allBold: boolean }) | undefined {
  const context = readTableRowContext(runtime, target);
  const row = target.closest('tr');
  const owner = target.closest('[mdtype="table"][cid]');
  if (!context || !row || !owner) return;
  const selected =
    axis === 'row'
      ? context.rows.rows.find((item) => item.id === row.getAttribute('cid'))?.cells
      : context.rows.rows.flatMap((item) => item.cells?.[target.cellIndex] ?? []);
  if (!selected) return;
  const fields = new Map(
    [...owner.querySelectorAll<HTMLElement>('[mdtype="table_cell"][cid]')].map((field) => [
      field.getAttribute('cid'),
      field,
    ]),
  );
  const cells: TableCellFormat['cells'][number][] = [];
  let hasText = false;
  for (const cell of selected) {
    const field = fields.get(cell.id);
    if (!field || raw(field) !== cell.text || cell.mark !== cell.text) return;
    const state = emphasis(field);
    hasText ||= state.text;
    if (!state.text || state.bold || !cell.text.trim()) continue;
    const body = withoutStrong(field).trim();
    if (!body || /[\r\n]/u.test(body)) return;
    // Keep adjacent emphasis delimiters distinct where possible.
    const marker = body.includes('**') || body.startsWith('*') || body.endsWith('*') ? '__' : '**';
    cells.push({ id: cell.id, before: cell.text, after: marker + body + marker });
  }
  return { kind: 'format-cells', cells, allBold: hasText && cells.length === 0 };
}

export function alignTableColumn(
  runtime: LegacyGlobals,
  target: HTMLTableCellElement,
  alignment: 'left' | 'center' | 'right',
): void {
  const editor = runtime.editor;
  const before = readTableRowContext(runtime, target);
  const node = before && editor?.getNode(before.rows.id);
  if (!editor || !before || !node || runtime.File?.isLocked || editor.isIME)
    throw Error('此表格暂不支持安全对齐');
  if (before.rows.alignment?.[target.cellIndex] === alignment) return;
  editor.undo.endSnap(true);
  const index = editor.undo.index;
  const prior = editor.undo.commandStack[index];
  const alignText: unknown = Reflect.apply(node.get, node, ['alignText']);
  const oldText = Array.isArray(alignText) ? alignText[target.cellIndex] : undefined;
  // The existing native attribute operation updates Markdown delimiter colons
  // and records one history entry. It does not apply per-cell HTML styles.
  node.attr('align_idx', [target.cellIndex, alignment], editor);
  // The native attr path saves the *new* delimiter fragment in both directions
  // once userText has been cleared by a structural/formatting operation. Repair
  // only this exact newly registered alignment command, preserving old bytes.
  const entry = editor.undo.commandStack[editor.undo.index];
  if (
    typeof oldText !== 'string' ||
    !entry ||
    editor.undo.index !== index + 1 ||
    editor.undo.commandStack[index] !== prior
  )
    return;
  const undo: unknown = Reflect.get(entry, 'undo'),
    redo: unknown = Reflect.get(entry, 'redo');
  const attribute = (commands: unknown) => {
    if (!Array.isArray(commands) || commands.length < 1 || commands.length > 2) return;
    const values = commands.filter(
      (value) =>
        value &&
        typeof value === 'object' &&
        value.type === 'attr' &&
        value.id === node.cid &&
        value.key === 'align_idx',
    );
    if (
      values.length === 1 &&
      Array.isArray(values[0].value) &&
      commands.every(
        (value) =>
          value === values[0] || (value && typeof value === 'object' && value.type === 'cursor'),
      )
    )
      return values[0].value as unknown[];
  };
  const old = attribute(undo),
    next = attribute(redo);
  if (
    old?.[0] === target.cellIndex &&
    next?.[0] === target.cellIndex &&
    (old[1] ?? null) === (before.rows.alignment?.[target.cellIndex] ?? null) &&
    next[1] === alignment &&
    old.length === 3 &&
    next.length === 3 &&
    old[2] === next[2]
  )
    old[2] = oldText;
}

export function applyTableHeading(
  runtime: LegacyGlobals,
  target: HTMLTableCellElement,
  plan: TableCellFormat,
  arm: (rowId: string, action: TableCellFormat) => boolean,
): void {
  const editor = runtime.editor,
    file = runtime.File;
  const before = readTableRowContext(runtime, target);
  const table = target.closest<HTMLElement>('[mdtype="table"][cid]');
  const node = before && editor?.getNode(before.rows.id);
  const rowId = target.closest('tr')?.getAttribute('cid');
  const targetId = target.querySelector('[mdtype="table_cell"][cid]')?.getAttribute('cid');
  if (
    !editor ||
    !file ||
    !before ||
    !table ||
    !node ||
    !rowId ||
    !targetId ||
    file.isLocked ||
    editor.isIME ||
    editor.sourceView.inSourceMode
  )
    throw Error('表格格式上下文已失效');
  if (!plan.cells.length) return;
  const changes: { node: LegacyNode; after: string }[] = [];
  for (const cell of plan.cells) {
    const current = editor.getNode(cell.id);
    if (!current || current.get('type') !== 'table_cell' || current.get('text') !== cell.before)
      throw Error('单元格内容已变化，请重新打开菜单');
    changes.push({ node: current, after: cell.after });
  }
  editor.undo.endSnap(true);
  const cursor = editor.selection.buildUndo();
  const old = structuredClone(editor.undo.buildReplaceUndo(node));
  if (!arm(rowId, plan)) throw Error('无法验证此次表格格式修改的源码范围');
  try {
    for (const change of changes) change.node.set('text', change.after);
    node.set('userText', undefined);
    const template = document.createElement('template');
    template.innerHTML = node.toHTML();
    const next = template.content.firstElementChild;
    if (!(next instanceof HTMLElement) || next.getAttribute('cid') !== node.cid)
      throw Error('表格格式渲染未通过校验');
    table.replaceWith(next);
    const after = readTableRowContext(runtime, next);
    if (
      !after ||
      !projectTableCellFormat(before.rows, after.rows, plan, 0, file.useCRLF ? '\r\n' : '\n')
    )
      throw Error('表格格式修改超出了目标单元格');
    for (const change of plan.cells) {
      const field = [...next.querySelectorAll('[mdtype="table_cell"][cid]')].find(
        (field) => field.getAttribute('cid') === change.id,
      );
      if (!field || !emphasis(field).bold) throw Error('此单元格暂不支持完整的 Markdown 加粗');
    }
    editor.refocus(targetId);
    const field = [...next.querySelectorAll<HTMLElement>('[mdtype="table_cell"][cid]')].find(
      (field) => field.getAttribute('cid') === targetId,
    );
    if (!field) throw Error('无法恢复表格光标');
    editor.selection.jumpIntoElemBegin(runtime.$(field));
    const current = editor.selection.buildUndo();
    const undo: CursorBookmark[] = cursor ? [cursor, old] : [old];
    const redo: CursorBookmark[] = [structuredClone(editor.undo.buildReplaceUndo(node))];
    if (current) redo.push(current);
    editor.undo.register({ undo, redo });
  } catch (error) {
    // No operation is registered until the whole axis and its rendered Markdown
    // are proved. Restore the native snapshot if any cell fails that proof.
    editor.undo.exeCommand(old);
    if (cursor) editor.undo.exeCommand(cursor);
    throw error;
  }
}
