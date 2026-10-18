import { assertPosition, assertWellFormedText } from '@marklyra/editor-core';
import type { LegacyEditor } from './legacy-types.js';

type CM = NonNullable<LegacyEditor['sourceView']['cm']>;
interface Position {
  line: number;
  ch: number;
  sticky?: 'before' | 'after' | null | undefined;
}
interface CodeState {
  text: string;
  ranges: { anchor: Position; head: Position }[];
  primary: number;
}
export interface CodeHistoryData {
  cid: string;
  before: CodeState;
  after: CodeState;
}
export interface CodeHistorySelection extends CodeHistoryData {
  cm: CM;
  doc: CM['doc'];
}
export interface PendingCodeHistorySelection {
  cid: string;
  cm: CM;
  doc: CM['doc'];
  before: CodeState;
  priorEntry: object | undefined;
  eligibleNew: boolean;
}
function codeTextEqual(model: unknown, value: string): boolean {
  if (typeof model !== 'string') return false;
  const consistent = (text: string) =>
    !/\r(?!\n)/.test(text) && (!text.includes('\r\n') || !/(?<!\r)\n/.test(text));
  return (
    consistent(model) &&
    consistent(value) &&
    model.replace(/\r\n/g, '\n') === value.replace(/\r\n/g, '\n')
  );
}
function current(editor: LegacyEditor, cid: string, cm: CM): boolean {
  const wrapper = cm.getWrapperElement(),
    owner = wrapper.closest<HTMLElement>('[cid][mdtype="fences"]');
  return (
    !editor.sourceView.inSourceMode &&
    !editor.isIME &&
    Boolean(
      owner &&
        owner.getAttribute('cid') === cid &&
        editor.writingArea.contains(owner) &&
        Reflect.get(wrapper, 'CodeMirror') === cm &&
        editor.getNode(cid)?.get('type') === 'fences' &&
        codeTextEqual(editor.getNode(cid)?.get('text'), cm.getValue()),
    )
  );
}
function state(cm: CM): CodeState | undefined {
  const pos = (value: Position): Position => {
    const result: Position = { line: value.line, ch: value.ch };
    if ('sticky' in value) {
      const sticky: unknown = Reflect.get(value, 'sticky');
      if (sticky !== undefined && sticky !== null && sticky !== 'before' && sticky !== 'after')
        throw Error('Invalid code selection affinity');
      result.sticky = sticky;
    }
    return result;
  };
  const ranges = cm
      .listSelections()
      .map((range) => ({ anchor: pos(range.anchor), head: pos(range.head) })),
    anchor = cm.getCursor('anchor'),
    head = cm.getCursor('head'),
    primary = ranges.findIndex(
      (range) =>
        range.anchor.line === anchor.line &&
        range.anchor.ch === anchor.ch &&
        range.head.line === head.line &&
        range.head.ch === head.ch,
    );
  if (primary < 0) return;
  return { text: cm.getValue(), ranges, primary };
}
/** Replay only actual original fences changes, in the original execution order.
 * This proves history membership; it neither edits a model nor authorizes raw patches. */
export function replayCodeChanges(
  source: string,
  commands: unknown,
  cid: string,
  reverse = false,
): string | undefined {
  if (
    !Array.isArray(commands) ||
    !commands.length ||
    /\r(?!\n)/.test(source) ||
    (source.includes('\r\n') && /(?<!\r)\n/.test(source))
  )
    return;
  let value = source;
  try {
    for (const command of reverse ? [...commands].reverse() : commands) {
      if (
        !command ||
        typeof command !== 'object' ||
        Reflect.get(command, 'type') !== 'fences' ||
        Reflect.get(command, 'id') !== cid
      )
        return;
      const change: unknown = Reflect.get(command, 'change');
      if (!change || typeof change !== 'object') return;
      const offset = (position: unknown) => {
        if (!position || typeof position !== 'object') throw Error('position');
        const line: unknown = Reflect.get(position, 'line'),
          ch: unknown = Reflect.get(position, 'ch');
        if (
          typeof line !== 'number' ||
          typeof ch !== 'number' ||
          !Number.isSafeInteger(line) ||
          !Number.isSafeInteger(ch) ||
          line < 0 ||
          ch < 0
        )
          throw Error('position');
        const lines = value.split(/\r\n|\n/);
        if (line >= lines.length || ch > (lines[line]?.length ?? 0)) throw Error('bounds');
        const ending = value.includes('\r\n') ? '\r\n' : '\n';
        const before = lines.slice(0, line).join(ending);
        const at = (line ? before.length + ending.length : 0) + ch;
        assertPosition(value, at);
        return at;
      };
      const from = offset(Reflect.get(change, 'from')),
        to = offset(Reflect.get(change, 'to')),
        text: unknown = Reflect.get(change, 'text');
      if (
        to < from ||
        !Array.isArray(text) ||
        !text.every((line: unknown) => typeof line === 'string' && !/[\r\n]/.test(line))
      )
        return;
      assertWellFormedText(text.join('\n'));
      value =
        value.slice(0, from) + text.join(value.includes('\r\n') ? '\r\n' : '\n') + value.slice(to);
    }
    return value;
  } catch {
    return;
  }
}
export function captureCodeHistorySelection(
  editor: LegacyEditor,
  event: KeyboardEvent | InputEvent,
  existing?: CodeHistorySelection,
): PendingCodeHistorySelection | undefined {
  if (
    !event.isTrusted ||
    event.isComposing ||
    editor.isIME ||
    editor.sourceView.inSourceMode ||
    !editor.writingArea.ownerDocument.hasFocus()
  )
    return;
  const target = event.target as Node | null,
    element = target?.nodeType === 1 ? (target as Element) : target?.parentElement,
    wrapper = element?.closest<HTMLElement>('.CodeMirror'),
    cm: unknown = wrapper && Reflect.get(wrapper, 'CodeMirror'),
    cid = wrapper?.closest('[cid][mdtype="fences"]')?.getAttribute('cid');
  if (!wrapper || !cm || typeof cm !== 'object' || !cid) return;
  const code = cm as CM;
  const ranges = code.listSelections(),
    eligibleNew =
      ranges.length > 1 ||
      ranges.some(
        (range) => range.anchor.line !== range.head.line || range.anchor.ch !== range.head.ch,
      );
  if (
    !eligibleNew &&
    (!existing || existing.cm !== code || existing.doc !== code.doc || existing.cid !== cid)
  )
    return;
  if (!current(editor, cid, code)) return;
  const before = state(code);
  if (!before) return;
  return {
    cid,
    cm: code,
    doc: code.doc,
    before,
    priorEntry: editor.undo.commandStack[editor.undo.index],
    eligibleNew,
  };
}
export function bindCodeHistorySelection(
  editor: LegacyEditor,
  pending: PendingCodeHistorySelection,
  entry: object,
  existing?: CodeHistorySelection,
): CodeHistorySelection | undefined {
  if (
    (entry === pending.priorEntry && !existing) ||
    (entry !== pending.priorEntry && !pending.eligibleNew) ||
    pending.cm.doc !== pending.doc ||
    !current(editor, pending.cid, pending.cm)
  )
    return;
  if (
    existing &&
    (existing.cm !== pending.cm || existing.doc !== pending.doc || existing.cid !== pending.cid)
  )
    return;
  const after = state(pending.cm),
    before = existing?.before ?? pending.before;
  if (
    !after ||
    replayCodeChanges(before.text, Reflect.get(entry, 'redo'), pending.cid) !== after.text ||
    replayCodeChanges(after.text, Reflect.get(entry, 'undo'), pending.cid, true) !== before.text
  )
    return;
  return { cid: pending.cid, cm: pending.cm, doc: pending.doc, before, after };
}
export function restoreCodeHistorySelection(
  editor: LegacyEditor,
  metadata: CodeHistorySelection,
  entry: object,
  direction: 'undo' | 'redo',
): boolean {
  if (
    metadata.cm.doc !== metadata.doc ||
    !current(editor, metadata.cid, metadata.cm) ||
    !editor.writingArea.ownerDocument.hasFocus()
  )
    return false;
  const expected = direction === 'undo' ? metadata.before : metadata.after;
  if (
    metadata.cm.getValue() !== expected.text ||
    replayCodeChanges(metadata.before.text, Reflect.get(entry, 'redo'), metadata.cid) !==
      metadata.after.text ||
    replayCodeChanges(metadata.after.text, Reflect.get(entry, 'undo'), metadata.cid, true) !==
      metadata.before.text
  )
    return false;
  metadata.cm.setSelections(expected.ranges, expected.primary);
  return true;
}

/** Only the validated same-document snapshot rollback caller may grant a new
 * CM owner. Data contains no DOM/CM object; exact undo and redo signatures are
 * checked by that caller before this bidirectional original-change proof. */
export function rebindRestoredCodeHistorySelection(
  editor: LegacyEditor,
  data: CodeHistoryData,
  entry: object,
): CodeHistorySelection | undefined {
  const owner = [
    ...editor.writingArea.querySelectorAll<HTMLElement>('[cid][mdtype="fences"]'),
  ].find((element) => element.getAttribute('cid') === data.cid);
  const model = editor.getNode(data.cid);
  if (!owner || model?.get('type') !== 'fences' || typeof model.get('text') !== 'string') return;
  const wrapper = owner.querySelector<HTMLElement>('.CodeMirror');
  let cm: unknown = wrapper && Reflect.get(wrapper, 'CodeMirror');
  if (!cm) {
    // Native snapshot restore leaves fences lazy. This explicit rollback grant
    // uses its own non-focusing factory, never a delayed same-cid owner replay.
    const factory: unknown = Reflect.get(editor.fences, 'getCm');
    if (typeof factory !== 'function') return;
    cm = Reflect.apply(factory, editor.fences, [data.cid]);
  }
  if (!cm || typeof cm !== 'object') return;
  const code = cm as CM;
  if (
    !current(editor, data.cid, code) ||
    replayCodeChanges(data.before.text, Reflect.get(entry, 'redo'), data.cid) !== data.after.text ||
    replayCodeChanges(data.after.text, Reflect.get(entry, 'undo'), data.cid, true) !==
      data.before.text
  )
    return;
  return { ...data, cm: code, doc: code.doc };
}
