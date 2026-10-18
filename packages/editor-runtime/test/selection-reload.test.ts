import { describe, expect, it } from 'vitest';
import type { LegacyEditor } from '../src/runtime/legacy-types.js';
import {
  ensureSourceReloadHistory,
  sourceReloadCheckpoint,
} from '../src/runtime/reload-history.js';

function fixture(text = 'Alpha\r\nBeta') {
  let ranges = [
      { anchor: { line: 0, ch: 3 }, head: { line: 0, ch: 1 } },
      { anchor: { line: 1, ch: 2 }, head: { line: 1, ch: 2 } },
    ],
    primary = 1,
    value = text;
  const calls: string[] = [];
  const cm = {
    doc: { history: { generation: 7, maxGeneration: 7, done: [], undone: [] } },
    getValue: () => value,
    getLine: (line: number) => value.split(/\r\n|\n/)[line],
    getCursor: (which: 'anchor' | 'head') => ranges[primary]?.[which],
    listSelections: () => ranges,
    setSelections: (next: typeof ranges, index: number) => {
      calls.push('setSelections');
      ranges = next;
      primary = index;
    },
    operation: <T>(fn: () => T) => {
      calls.push('operation');
      return fn();
    },
    changeGeneration: () => {
      calls.push('changeGeneration');
      return cm.doc.history.generation;
    },
    replaceRange: () => {
      throw Error('Unexpected text rewrite');
    },
  };
  const editor = { sourceView: { inSourceMode: true, cm } } as unknown as LegacyEditor;
  return {
    editor,
    cm,
    calls,
    setValue: (next: string) => {
      value = next;
    },
    ranges: () => ranges,
    primary: () => primary,
  };
}
describe('Source range preservation for a real native reload history entry', () => {
  it('restores every range and primary after an equal-text native transaction without fabricating history', () => {
    const f = fixture(),
      before = sourceReloadCheckpoint(f.editor);
    f.cm.doc.history.generation = 8;
    f.cm.setSelections([{ anchor: { line: 1, ch: 2 }, head: { line: 1, ch: 2 } }], 0);
    f.calls.length = 0;
    ensureSourceReloadHistory(f.editor, before);
    expect(f.ranges()).toEqual(before?.ranges);
    expect(f.primary()).toBe(1);
    expect(f.cm.doc.history.generation).toBe(8);
    expect(f.calls).toEqual(['operation', 'setSelections', 'setSelections']);
  });
  it('preserves actual sticky null/before/after and absence without inventing fields', () => {
    for (const sticky of [null, 'before', 'after'] as const) {
      const f = fixture();
      Reflect.set(f.ranges()[0]?.anchor ?? {}, 'sticky', sticky);
      const before = sourceReloadCheckpoint(f.editor);
      expect(Reflect.get(before?.ranges[0]?.anchor ?? {}, 'sticky')).toBe(sticky);
      expect('sticky' in (before?.ranges[1]?.head ?? {})).toBe(false);
    }
    const f = fixture();
    Reflect.set(f.ranges()[0]?.anchor ?? {}, 'sticky', 'invalid');
    expect(() => sourceReloadCheckpoint(f.editor)).toThrow('Invalid source selection affinity');
  });
  it('keeps the native selection when reload actually changes its text', () => {
    const f = fixture(),
      before = sourceReloadCheckpoint(f.editor);
    f.cm.doc.history.generation = 8;
    f.setValue('Different');
    f.calls.length = 0;
    ensureSourceReloadHistory(f.editor, before);
    expect(f.calls).toEqual([]);
  });
  it('rejects a replaced CodeMirror document instead of applying stale ranges', () => {
    const f = fixture(),
      before = sourceReloadCheckpoint(f.editor);
    f.cm.doc = { history: { generation: 8, maxGeneration: 8, done: [], undone: [] } };
    expect(() => ensureSourceReloadHistory(f.editor, before)).toThrow('Source editor changed');
  });
  it('refuses changed text without a real transaction', () => {
    const f = fixture(),
      before = sourceReloadCheckpoint(f.editor);
    f.setValue('Different');
    expect(() => ensureSourceReloadHistory(f.editor, before)).toThrow(
      'no native history transaction',
    );
  });
});
