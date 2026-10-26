import type { LegacyEditor } from './legacy-types.js';

type SourceMirror = NonNullable<LegacyEditor['sourceView']['cm']>;
interface SourcePosition {
  line: number;
  ch: number;
  sticky?: 'before' | 'after' | null | undefined;
}
export function sourcePosition(value: { line: number; ch: number }): SourcePosition {
  const result: SourcePosition = { line: value.line, ch: value.ch };
  if ('sticky' in value) {
    const sticky: unknown = Reflect.get(value, 'sticky');
    if (sticky !== undefined && sticky !== null && sticky !== 'before' && sticky !== 'after')
      throw Error('Invalid source selection affinity');
    result.sticky = sticky;
  }
  return result;
}
interface SourceReloadCheckpoint {
  cm: SourceMirror;
  doc: SourceMirror['doc'];
  text: string;
  generation: number;
  ranges: { anchor: SourcePosition; head: SourcePosition }[];
  primary: number;
}

export function sourceReloadCheckpoint(editor: LegacyEditor): SourceReloadCheckpoint | undefined {
  const cm = editor.sourceView.inSourceMode ? editor.sourceView.cm : undefined;
  if (!cm) return;
  const ranges = cm.listSelections().map((range) => ({
    anchor: sourcePosition(range.anchor),
    head: sourcePosition(range.head),
  }));
  const anchor = cm.getCursor('anchor'),
    head = cm.getCursor('head');
  const primary = ranges.findIndex(
    (range) =>
      range.anchor.line === anchor.line &&
      range.anchor.ch === anchor.ch &&
      range.head.line === head.line &&
      range.head.ch === head.ch,
  );
  if (primary < 0) throw new Error('Cannot capture source reload selection');
  return {
    cm,
    doc: cm.doc,
    text: cm.getValue(),
    generation: cm.doc.history.generation,
    ranges,
    primary,
  };
}

/** The setValue skips identical strings, so a BOM-only disk version
 * otherwise has no native undo identity. Create a real, isolated CM operation;
 * never modify its history arrays/generation or manufacture a tracking target.
 * BOM-only reloads retain the content transaction identity. */
export function ensureSourceReloadHistory(
  editor: LegacyEditor,
  before: SourceReloadCheckpoint | undefined,
): void {
  if (!before) return;
  const { cm } = before;
  if (!editor.sourceView.inSourceMode || editor.sourceView.cm !== cm || cm.doc !== before.doc)
    throw new Error('Source editor changed during external reload');
  if (cm.doc.history.generation !== before.generation) {
    // Native setValue can create an equal-text transaction (for example after
    // Undo/Redo) while still discarding non-primary ranges. Keep that real
    // history identity and repair only the unchanged document's view state.
    if (cm.getValue() === before.text) cm.operation(() => restoreSourceReloadSelections(before));
    return;
  }
  if (cm.getValue() !== before.text)
    throw new Error('Changed source reload has no native history transaction');

  // Native reload's setCursor loses direction/multiple ranges even on an equal
  // string. Restore them before opening the native history event.
  cm.setSelections(before.ranges, before.primary);
  cm.changeGeneration(true);
  cm.operation(() => {
    const start = { line: 0, ch: 0 };
    const firstLength = (before.text.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
    if (!before.text) {
      cm.replaceRange('X', start, start, 'fromDisk');
      cm.replaceRange('', start, { line: 0, ch: 1 }, 'fromDisk');
    } else if (cm.getLine(0) === '') {
      cm.replaceRange('\n', start, { line: 1, ch: 0 }, 'fromDisk');
    } else {
      cm.replaceRange(
        before.text.slice(0, firstLength),
        start,
        { line: 0, ch: firstLength },
        'fromDisk',
      );
    }
    restoreSourceReloadSelections(before);
  });
  cm.changeGeneration(true);
  if (cm.getValue() !== before.text || cm.doc.history.generation === before.generation)
    throw new Error('Format-only reload did not create a valid native history transaction');
}

/** Ask CodeMirror itself to reset its hidden input buffer without blurring or
 * assigning private history/selection fields. Only used when its text is equal. */
function restoreSourceReloadSelections(before: SourceReloadCheckpoint): void {
  const { cm } = before;
  const start = { line: 0, ch: 0 };
  const firstLength = (before.text.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
  // Native reload also resets the hidden textarea selection directly. Setting
  // an equal logical range alone does not reset CM's input buffer: the next
  // real key can otherwise be inserted before the previous typed character.
  // A different, valid caret and restoration in this same operation ask CM
  // to synchronize its own input state without private-field writes or blur.
  if (before.text) {
    const atStart =
      before.ranges.length === 1 &&
      before.ranges.every(
        (range) =>
          range.anchor.line === 0 &&
          range.anchor.ch === 0 &&
          range.head.line === 0 &&
          range.head.ch === 0,
      );
    const caret = !atStart
      ? start
      : cm.getLine(0) === ''
        ? { line: 1, ch: 0 }
        : { line: 0, ch: firstLength };
    cm.setSelections([{ anchor: caret, head: caret }], 0);
  }
  cm.setSelections(before.ranges, before.primary);
}
