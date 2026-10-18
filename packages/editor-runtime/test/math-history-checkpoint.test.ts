import { describe, expect, it } from 'vitest';
import type { LegacyGlobals } from '../src/runtime/legacy-types.js';
import { RuntimeSourceTracking } from '../src/runtime/source-tracking.js';

function fixture(other = false, unseen = false, lazy = false) {
  let value = '$$\nold\n$$\n',
    pendingValue = value;
  const cursor = {
      undo: [{ type: 'cursor', id: 'math', focus: 'math_block' }],
      redo: [{ type: 'cursor', id: 'math', start: 0, end: 0 }],
    },
    content = { undo: [{ type: 'fences', id: 'math' }], redo: [{ type: 'fences', id: 'math' }] },
    undo = {
      index: 0,
      commandStack: [cursor, content],
      undo() {
        this.index = 0;
        pendingValue = '$$\nold\n$$\n';
        if (!lazy) value = pendingValue;
      },
      redo() {
        this.index = 1;
        pendingValue = '$$\nnew\n$$\n';
        if (!lazy) value = pendingValue;
      },
    },
    editor = {
      writingArea: { ownerDocument: null },
      sourceView: { inSourceMode: false },
      mathBlock: { currentCm: { cid: other ? 'other' : 'math' } },
      nodeMap: { blocks: { sortedFirst: () => undefined }, toMark: () => value },
      warpContentWithOption: (text: string) => text,
      getMarkdown: () => value,
      getNode: () => ({ get: () => (other ? 'paragraph' : 'math_block') }),
      undo,
    },
    runtime = { editor, File: { sync: () => (value = pendingValue) } } as unknown as LegacyGlobals,
    tracking = new RuntimeSourceTracking(runtime, () => false),
    initial = (() => {
      if (unseen) undo.index = -1;
      const checkpoint = tracking.reset(value).checkpoint;
      undo.index = 0;
      return checkpoint;
    })();
  value = pendingValue = '$$\nnew\n$$\n';
  const pending = tracking.capture(value).checkpoint;
  undo.index = 1;
  tracking.capture(value);
  return { tracking, undo, initial, pending, source: () => value };
}
describe('math pending content and the preceding cursor-only receipt', () => {
  it.each([false, true])(
    'keeps an unseen=%s cursor receipt on the old checkpoint until content has its own entry',
    (unseen) => {
      const f = fixture(false, unseen);
      f.undo.undo();
      const restored = f.tracking.capture(f.source()).changes.at(-1);
      expect(restored?.historyTarget).toBe(f.initial);
      expect(restored?.historyTarget).not.toBe(f.pending);
      f.undo.redo();
      expect(f.tracking.capture(f.source()).changes.at(-1)?.historyTarget).toBe(f.pending);
    },
  );
  it('flushes the actual restored math CM before assigning its history target', () => {
    const f = fixture(false, true, true);
    f.undo.undo();
    expect(f.source()).toBe('$$\nold\n$$\n');
    expect(f.tracking.capture(f.source()).changes.at(-1)?.historyTarget).toBe(f.initial);
    f.undo.redo();
    expect(f.source()).toBe('$$\nnew\n$$\n');
    expect(f.tracking.capture(f.source()).changes.at(-1)?.historyTarget).toBe(f.pending);
  });
  it('does not apply the math rule to a paragraph receipt', () => {
    const f = fixture(true);
    f.undo.undo();
    expect(f.tracking.capture(f.source()).changes.at(-1)?.historyTarget).toBe(f.pending);
  });
});
