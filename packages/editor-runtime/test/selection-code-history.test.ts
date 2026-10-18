import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import {
  bindCodeHistorySelection,
  captureCodeHistorySelection,
  type PendingCodeHistorySelection,
  rebindRestoredCodeHistorySelection,
  replayCodeChanges,
  restoreCodeHistorySelection,
} from '../src/runtime/code-history-selection.js';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';

const original = 'Alpha\r\nBeta\r\nGamma',
  changed = 'AQha\r\nBeta\r\nGQa';
const changes = (type: 'undo' | 'redo') => [
  {
    type: 'fences',
    id: 'code',
    change: {
      from: { line: 2, ch: 1 },
      to: { line: 2, ch: type === 'redo' ? 4 : 2 },
      text: [type === 'redo' ? 'Q' : 'amm'],
    },
  },
  {
    type: 'fences',
    id: 'code',
    change: {
      from: { line: 0, ch: 1 },
      to: { line: 0, ch: type === 'redo' ? 3 : 2 },
      text: [type === 'redo' ? 'Q' : 'lp'],
    },
  },
];
const ranges = [
  { anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 3 } },
  { anchor: { line: 2, ch: 4 }, head: { line: 2, ch: 1 } },
];
function fixture() {
  let value = changed,
    model = changed,
    selected = ranges,
    primary = 1;
  const entry = { undo: changes('undo'), redo: changes('redo') };
  const owner = { getAttribute: () => 'code' },
    wrapper = { closest: () => owner };
  const cm = {
    doc: { history: { generation: 1 } },
    getWrapperElement: () => wrapper,
    getValue: () => value,
    listSelections: () => selected,
    getCursor: (which: 'anchor' | 'head') => selected[primary]?.[which],
    setSelections: (next: typeof ranges, index: number) => {
      selected = next;
      primary = index;
    },
  };
  Reflect.set(wrapper, 'CodeMirror', cm);
  Reflect.set(owner, 'querySelector', () => wrapper);
  const editor = {
    isIME: false,
    sourceView: { inSourceMode: false },
    writingArea: {
      contains: (node: unknown) => node === owner,
      querySelectorAll: () => [owner],
      ownerDocument: { hasFocus: () => true },
    },
    getNode: () => ({ get: (key: string) => (key === 'type' ? 'fences' : model) }),
  } as unknown as LegacyEditor;
  const pending = {
    cid: 'code',
    cm,
    doc: cm.doc,
    before: { text: original, ranges, primary: 1 },
    priorEntry: undefined,
    eligibleNew: true,
  } as unknown as PendingCodeHistorySelection;
  return {
    editor,
    cm,
    pending,
    entry,
    selected: () => selected,
    primary: () => primary,
    setText: (next: string) => {
      value = next;
      model = next;
    },
    setModel: (next: string) => {
      model = next;
    },
  };
}
describe('CodeMirror original-entry selection proof', () => {
  it('replays every real change in exact original execution order', () => {
    expect(replayCodeChanges(original, changes('redo'), 'code')).toBe(changed);
    expect(replayCodeChanges(changed, changes('undo'), 'code', true)).toBe(original);
  });
  it('round-trips directed replacement groups across uniform EOL and Unicode boundaries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', '中', '😀', 'é'), { minLength: 1, maxLength: 12 }),
        fc.constantFrom('\n', '\r\n'),
        (characters, ending) => {
          const word = characters.join(''),
            before = `A${word}X${ending}Beta${ending}A${word}X`,
            after = `AQX${ending}Beta${ending}AQX`;
          const redo = [2, 0].map((line) => ({
            type: 'fences',
            id: 'code',
            change: { from: { line, ch: 1 }, to: { line, ch: word.length + 1 }, text: ['Q'] },
          }));
          const undo = [2, 0].map((line) => ({
            type: 'fences',
            id: 'code',
            change: { from: { line, ch: 1 }, to: { line, ch: 2 }, text: [word] },
          }));
          expect(replayCodeChanges(before, redo, 'code')).toBe(after);
          expect(replayCodeChanges(after, undo, 'code', true)).toBe(before);
        },
      ),
      { numRuns: 100, seed: 404020 },
    );
  });
  it('rejects unrelated commands, wrong cid, invalid positions, CRLF and surrogate boundaries', () => {
    for (const commands of [
      [{ type: 'cursor', id: 'code' }],
      [{ ...changes('redo')[0], id: 'other' }],
      [
        {
          type: 'fences',
          id: 'code',
          change: { from: { line: 4, ch: 0 }, to: { line: 4, ch: 0 }, text: ['X'] },
        },
      ],
      [
        {
          type: 'fences',
          id: 'code',
          change: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 1 }, text: ['X\nY'] },
        },
      ],
    ])
      expect(replayCodeChanges(original, commands, 'code')).toBeUndefined();
    expect(
      replayCodeChanges(
        '😀',
        [
          {
            type: 'fences',
            id: 'code',
            change: { from: { line: 0, ch: 1 }, to: { line: 0, ch: 2 }, text: ['X'] },
          },
        ],
        'code',
      ),
    ).toBeUndefined();
  });
  it('refuses mixed and bare CR source coordinate systems', () => {
    for (const value of ['A\r\nB\nC', 'A\rB'])
      expect(replayCodeChanges(value, changes('redo'), 'code')).toBeUndefined();
  });
  it('binds only the exact original before/after model change to a new real entry', () => {
    const f = fixture(),
      metadata = bindCodeHistorySelection(f.editor, f.pending, f.entry);
    expect(metadata?.before.text).toBe(original);
    expect(metadata?.after.text).toBe(changed);
    expect(
      bindCodeHistorySelection(f.editor, { ...f.pending, priorEntry: f.entry }, f.entry),
    ).toBeUndefined();
  });
  it('proves parser LF versus live CM CRLF without accepting mixed endings', () => {
    const f = fixture();
    f.setModel(changed.replace(/\r\n/g, '\n'));
    expect(bindCodeHistorySelection(f.editor, f.pending, f.entry)).toBeDefined();
    f.setModel('AQha\r\nBeta\nGQa');
    expect(bindCodeHistorySelection(f.editor, f.pending, f.entry)).toBeUndefined();
  });
  it('does not bind a new ordinary caret group from a previously eligible entry', () => {
    const f = fixture();
    expect(
      bindCodeHistorySelection(f.editor, { ...f.pending, eligibleNew: false }, f.entry),
    ).toBeUndefined();
  });
  it('refuses an unrelated model or changed CM document', () => {
    const f = fixture();
    f.setModel('other');
    expect(bindCodeHistorySelection(f.editor, f.pending, f.entry)).toBeUndefined();
    f.setText(changed);
    f.cm.doc = { history: { generation: 9 } };
    expect(bindCodeHistorySelection(f.editor, f.pending, f.entry)).toBeUndefined();
  });
  it('skips a new ordinary collapsed caret before reading/copying the code text', () => {
    const f = fixture();
    f.cm.setSelections([{ anchor: { line: 0, ch: 1 }, head: { line: 0, ch: 1 } }], 0);
    const read = vi.spyOn(f.cm, 'getValue');
    const wrapper = f.cm.getWrapperElement();
    const event = {
      isTrusted: true,
      isComposing: false,
      target: { nodeType: 1, closest: () => wrapper },
    } as unknown as InputEvent;
    expect(captureCodeHistorySelection(f.editor, event)).toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
  it('uses only the original synchronous factory for a lazy rollback owner', () => {
    const f = fixture(),
      metadata = bindCodeHistorySelection(f.editor, f.pending, f.entry);
    if (!metadata) throw Error('Proof');
    const wrapper = f.cm.getWrapperElement(),
      owner = wrapper.closest();
    let created = false,
      calls = 0;
    Reflect.set(owner, 'querySelector', () => (created ? wrapper : undefined));
    Reflect.set(f.editor, 'fences', {
      getCm: (cid: string) => {
        expect(cid).toBe('code');
        created = true;
        calls++;
        return f.cm;
      },
    });
    const rebound = rebindRestoredCodeHistorySelection(
      f.editor,
      { cid: metadata.cid, before: metadata.before, after: metadata.after },
      f.entry,
    );
    expect(rebound?.cm).toBe(f.cm);
    expect(calls).toBe(1);
  });
  it('explicit rollback rebinds data-only metadata to the current proven new CM document', () => {
    const f = fixture(),
      metadata = bindCodeHistorySelection(f.editor, f.pending, f.entry);
    if (!metadata) throw Error('Proof');
    const data = { cid: metadata.cid, before: metadata.before, after: metadata.after };
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    f.cm.doc = { history: { generation: 9 } };
    const rebound = rebindRestoredCodeHistorySelection(f.editor, data, f.entry);
    expect(rebound?.doc).toBe(f.cm.doc);
    expect(rebound?.doc).not.toBe(metadata.doc);
    expect(
      rebindRestoredCodeHistorySelection(f.editor, data, { undo: [], redo: [] }),
    ).toBeUndefined();
  });
  it('restores all directions/primary after exact Undo but refuses stale doc/entry/model', () => {
    const f = fixture(),
      metadata = bindCodeHistorySelection(f.editor, f.pending, f.entry);
    if (!metadata) throw Error('Proof');
    f.setText(original);
    expect(restoreCodeHistorySelection(f.editor, metadata, f.entry, 'undo')).toBe(true);
    expect(f.selected()).toEqual(ranges);
    expect(f.primary()).toBe(1);
    expect(restoreCodeHistorySelection(f.editor, metadata, { undo: [], redo: [] }, 'undo')).toBe(
      false,
    );
    f.setModel('other');
    expect(restoreCodeHistorySelection(f.editor, metadata, f.entry, 'undo')).toBe(false);
    f.setText(original);
    f.cm.doc = { history: { generation: 9 } };
    expect(restoreCodeHistorySelection(f.editor, metadata, f.entry, 'undo')).toBe(false);
  });
});
