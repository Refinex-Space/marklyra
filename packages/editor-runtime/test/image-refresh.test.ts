import { describe, expect, it } from 'vitest';
import { refreshImageBlocks } from '../src/runtime/image-refresh.js';

function fixture(bookmark: unknown) {
  const reads: unknown[][] = [];
  const selection = {
    buildUndo(...args: unknown[]): unknown {
      reads.push(args);
      return bookmark;
    },
  };
  const brush: { brushNode(id: string): unknown } = { brushNode: () => undefined };
  return { selection, brush, reads };
}

describe('host image refresh bookmark scope', () => {
  it('does not capture for an empty batch and treats null as a valid baseline', () => {
    const editor = fixture(null);
    refreshImageBlocks(editor, []);
    expect(editor.reads).toHaveLength(0);
    const values: unknown[] = [];
    editor.brush.brushNode = () => values.push(editor.selection.buildUndo());
    refreshImageBlocks(editor, ['a', 'b']);
    expect(editor.reads).toHaveLength(1);
    expect(values).toEqual([null, null]);
  });

  it('clones all JSON cursor fields independently, including CodeMirror Pos and selections', () => {
    class Pos {
      constructor(
        readonly line: number,
        readonly ch: number,
        readonly sticky: string | null = null,
      ) {}
    }
    const bookmark = {
      type: 'cursor',
      id: 'fence',
      pos: new Pos(2, 3),
      selections: [{ anchor: new Pos(1, 8), head: new Pos(2, 3) }],
      startId: 'a',
      endId: 'b',
      start: 1,
      end: 2,
      inSourceMode: false,
      focus: 'fences',
    };
    const editor = fixture(bookmark);
    const native = editor.selection.buildUndo;
    const received: unknown[] = [];
    editor.brush.brushNode = () => {
      const value = editor.selection.buildUndo() as typeof bookmark;
      received.push(JSON.parse(JSON.stringify(value)));
      value.selections[0]?.head && Reflect.set(value.selections[0].head, 'ch', 999);
      Reflect.set(value, 'start', 999);
    };
    refreshImageBlocks(editor, ['a', 'b']);
    expect(editor.reads).toHaveLength(1);
    expect(received).toEqual([
      JSON.parse(JSON.stringify(bookmark)),
      JSON.parse(JSON.stringify(bookmark)),
    ]);
    expect(bookmark.pos.ch).toBe(3);
    expect(bookmark.start).toBe(1);
    expect(editor.selection.buildUndo).toBe(native);
  });

  it('delegates every later, parameterized, foreign-receiver and nested capture', () => {
    const editor = fixture({ type: 'cursor', id: 'a', start: 0, end: 0 });
    const baseline = editor.selection.buildUndo;
    let nativeCalls = 0;
    editor.selection.buildUndo = function (...args) {
      nativeCalls++;
      if (args[0] === 'nested') this.buildUndo();
      return baseline.apply(this, args);
    };
    const original = editor.selection.buildUndo;
    editor.brush.brushNode = (id) => {
      if (id === 'parameterized') editor.selection.buildUndo('nested');
      if (id === 'foreign') Reflect.apply(editor.selection.buildUndo, {}, []);
      editor.selection.buildUndo();
      editor.selection.buildUndo();
    };
    refreshImageBlocks(editor, ['plain', 'parameterized', 'foreign']);
    // Baseline + plain's second + 4 parameterized/nested + 3 foreign-node calls.
    expect(nativeCalls).toBe(9);
    expect(editor.selection.buildUndo).toBe(original);
  });

  it('restores the method before asynchronous continuations and after a thrown brush', async () => {
    const editor = fixture({ type: 'cursor', id: 'a', start: 0, end: 0 });
    const native = editor.selection.buildUndo;
    const continuations: Promise<unknown>[] = [];
    editor.brush.brushNode = (id) => {
      editor.selection.buildUndo();
      continuations.push(Promise.resolve().then(() => editor.selection.buildUndo()));
      if (id === 'throw') throw new Error('brush failure');
    };
    expect(() => refreshImageBlocks(editor, ['a', 'throw'])).toThrow('brush failure');
    expect(editor.selection.buildUndo).toBe(native);
    await Promise.all(continuations);
    expect(editor.reads).toHaveLength(3);
  });

  it('does not overwrite a method replacement made inside a brush', () => {
    const editor = fixture({ type: 'cursor', id: 'a', start: 0, end: 0 });
    let replacementCalls = 0;
    const replacement = () => {
      replacementCalls++;
      return null;
    };
    editor.brush.brushNode = (id) => {
      editor.selection.buildUndo();
      if (id === 'a') editor.selection.buildUndo = replacement;
    };
    refreshImageBlocks(editor, ['a', 'b']);
    expect(editor.selection.buildUndo).toBe(replacement);
    expect(editor.reads).toHaveLength(1);
    expect(replacementCalls).toBe(1);
  });

  it('restores inherited methods without introducing a permanent own shadow', () => {
    const editor = fixture({ type: 'cursor', id: 'a' });
    const inherited = Object.create(editor.selection) as typeof editor.selection;
    const native = inherited.buildUndo;
    editor.selection = inherited;
    editor.brush.brushNode = () => editor.selection.buildUndo();
    refreshImageBlocks(editor, ['a']);
    expect(Object.hasOwn(inherited, 'buildUndo')).toBe(false);
    expect(inherited.buildUndo).toBe(native);
  });

  it('falls back for unsupported cursor data without invoking serialization accessors', () => {
    let getterCalls = 0;
    const tagged = Object.create({
      get [Symbol.toStringTag]() {
        getterCalls++;
        return 'Object';
      },
    });
    tagged.type = 'cursor';
    const getter = {
      type: 'cursor',
      get extra() {
        getterCalls++;
        return 1;
      },
    };
    const cyclic: Record<string, unknown> = { type: 'cursor' };
    cyclic.self = cyclic;
    const values: unknown[] = [
      { type: 'cursor', extra: undefined },
      { type: 'cursor', start: Number.NaN },
      { type: 'cursor', pos: new Date() },
      {
        type: 'cursor',
        toJSON() {
          throw new Error('must not invoke');
        },
      },
      { type: 'unexpected' },
      getter,
      tagged,
      cyclic,
    ];
    for (const bookmark of values) {
      const editor = fixture(bookmark);
      editor.brush.brushNode = () => editor.selection.buildUndo();
      refreshImageBlocks(editor, ['a', 'b']);
      expect(editor.reads).toHaveLength(3);
    }
    expect(getterCalls).toBe(0);
  });
});
