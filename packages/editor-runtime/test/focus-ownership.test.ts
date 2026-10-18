import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CursorBookmark } from '../src/protocol.js';
import { RuntimeFocus } from '../src/runtime/focus.js';
import type { LegacyEditor, LegacyGlobals } from '../src/runtime/legacy-types.js';

function fixture() {
  const exeCommand = vi.fn<(bookmark: CursorBookmark) => unknown>(() => false);
  const area = { focus: vi.fn() };
  const buildUndo = vi.fn(() => cursor());
  const editor = {
    writingArea: area,
    sourceView: { inSourceMode: false },
    undo: { exeCommand },
    selection: { buildUndo },
    isIME: false,
  } as unknown as LegacyEditor;
  const runtime = { editor, _options: {} } as LegacyGlobals;
  let generation = 1,
    owns = false,
    available = true;
  const focus = new RuntimeFocus(
    runtime,
    () => generation,
    () => owns,
    () => available,
  );
  return {
    focus,
    editor,
    runtime,
    exeCommand,
    buildUndo,
    area,
    next: () => generation++,
    own: () => {
      owns = true;
    },
    block: () => {
      available = false;
    },
    unblock: () => {
      available = true;
    },
  };
}
const cursor = (start = 7): CursorBookmark => ({ type: 'cursor', id: 'node', start, end: start });

afterEach(() => vi.unstubAllGlobals());

describe('deferred original brush cursor ownership', () => {
  it('defers only a background cursor and copies history-owned data', () => {
    const f = fixture(),
      value = cursor();
    expect(f.focus.restoreBrushCursor(f.editor, value)).toBe(false);
    expect(f.exeCommand).not.toHaveBeenCalled();
    value.start = 999;
    expect(f.focus.bookmark()).toEqual(cursor());
    const snapshot = f.focus.bookmark();
    if (snapshot) snapshot.end = 999;
    expect(f.focus.bookmark()).toEqual(cursor());
    f.focus.focus();
    expect(f.exeCommand).toHaveBeenCalledExactlyOnceWith(cursor());
    expect(f.focus.bookmark()).toBeUndefined();
  });
  it('retains the latest remapping and restores only once', () => {
    const f = fixture();
    f.focus.restoreBrushCursor(f.editor, cursor());
    f.focus.restoreBrushCursor(f.editor, cursor(9));
    f.own();
    f.focus.resume();
    f.focus.resume();
    expect(f.exeCommand).toHaveBeenCalledExactlyOnceWith(cursor(9));
  });
  it('preserves return values and side effects while the editor owns input', () => {
    const f = fixture();
    f.own();
    const result = Promise.resolve('native');
    f.exeCommand.mockReturnValue(result);
    expect(f.focus.restoreBrushCursor(f.editor, cursor())).toBe(result);
    expect(f.focus.bookmark()).toBeUndefined();
  });
  it.each(['text', 'replace'])('never intercepts a %s history mutation', (type) => {
    const f = fixture(),
      command = { type, id: 'node', text: 'edit' };
    f.focus.restoreBrushCursor(f.editor, command);
    expect(f.exeCommand).toHaveBeenCalledExactlyOnceWith(command);
  });
  it.each(['generation', 'editor', 'source'] as const)(
    'drops stale deferred cursors after %s changes',
    (kind) => {
      const f = fixture();
      f.focus.restoreBrushCursor(f.editor, cursor());
      if (kind === 'generation') f.next();
      if (kind === 'editor') f.runtime.editor = { ...f.editor };
      if (kind === 'source') f.editor.sourceView.inSourceMode = true;
      expect(f.focus.bookmark()).toBeUndefined();
      f.own();
      f.focus.resume();
      expect(f.exeCommand).not.toHaveBeenCalled();
    },
  );
  it('allows an explicit command to restore its cursor before its action', () => {
    const f = fixture(),
      order: string[] = [];
    f.exeCommand.mockImplementation(() => {
      order.push('cursor');
      return false;
    });
    f.focus.restoreBrushCursor(f.editor, cursor());
    expect(
      f.focus.command(() => {
        order.push('action');
        return 42;
      }),
    ).toBe(42);
    expect(order).toEqual(['cursor', 'action']);
  });
  it('does not restore a deferred cursor during load or composition', () => {
    const f = fixture();
    f.focus.restoreBrushCursor(f.editor, cursor());
    f.block();
    f.own();
    f.focus.resume();
    expect(() => f.focus.focus()).toThrow('编辑');
    expect(() => f.focus.command(() => true)).toThrow('编辑');
    expect(f.exeCommand).not.toHaveBeenCalled();
    f.unblock();
    f.focus.resume();
    expect(f.exeCommand).toHaveBeenCalledExactlyOnceWith(cursor());
  });
  it('discards pending work on destroy and rejects old-editor callbacks', () => {
    const f = fixture();
    expect(f.focus.restoreBrushCursor({ ...f.editor }, cursor())).toBe(false);
    f.focus.restoreBrushCursor(f.editor, cursor());
    f.focus.destroy();
    f.own();
    f.focus.resume();
    expect(f.focus.restoreBrushCursor(f.editor, cursor())).toBe(false);
    expect(f.exeCommand).not.toHaveBeenCalled();
    expect(() => f.focus.focus()).toThrow('destroyed');
  });
  it('tags the original reader result and rejects a callback captured before a new load', () => {
    const f = fixture();
    f.focus.install();
    const value = f.editor.selection.buildUndo();
    if (!value) throw new Error('Missing cursor');
    f.next();
    f.own();
    expect(f.focus.restoreBrushCursor(f.editor, value)).toBe(false);
    expect(f.exeCommand).not.toHaveBeenCalled();
  });
  it('a later in-editor gesture rejects an old cursor even before it was deferred', () => {
    const f = fixture();
    f.focus.install();
    const value = f.editor.selection.buildUndo();
    if (!value) throw new Error('Missing cursor');
    class Target {
      closest() {
        return this;
      }
    }
    vi.stubGlobal('Element', Target);
    f.focus.interact(new Target() as unknown as EventTarget);
    f.own();
    expect(f.focus.restoreBrushCursor(f.editor, value)).toBe(false);
    expect(f.exeCommand).not.toHaveBeenCalled();
  });
  it('a later explicit command rejects an outstanding earlier parser cursor', () => {
    const f = fixture();
    f.focus.install();
    const value = f.editor.selection.buildUndo();
    if (!value) throw new Error('Missing cursor');
    f.focus.command(() => true);
    f.own();
    f.focus.restoreBrushCursor(f.editor, value);
    expect(f.exeCommand).not.toHaveBeenCalled();
  });
  it('restores the reader descriptor on destroy and leaves a later wrapper intact', () => {
    const f = fixture();
    const before = Object.getOwnPropertyDescriptor(f.editor.selection, 'buildUndo');
    f.focus.install();
    expect(f.editor.selection.buildUndo).not.toBe(f.buildUndo);
    f.focus.destroy();
    expect(Object.getOwnPropertyDescriptor(f.editor.selection, 'buildUndo')).toEqual(before);
    const g = fixture();
    g.focus.install();
    const replacement = vi.fn(() => cursor());
    g.editor.selection.buildUndo = replacement;
    g.focus.destroy();
    expect(g.editor.selection.buildUndo).toBe(replacement);
  });
  it('uses the captured native executor without rereading a replaced undo method', () => {
    const f = fixture();
    const captured = vi.fn(() => 'captured');
    f.focus.restoreBrushCursor(f.editor, cursor(), captured);
    f.editor.undo.exeCommand = () => {
      throw new Error('reread');
    };
    expect(() => f.focus.focus()).not.toThrow();
    expect(captured).toHaveBeenCalledExactlyOnceWith(cursor());
  });
  it('bound commands keep their own selection instead of restoring an older deferred cursor', () => {
    const f = fixture();
    f.focus.restoreBrushCursor(f.editor, cursor());
    expect(f.focus.command(() => 'bound-selection', false)).toBe('bound-selection');
    expect(f.exeCommand).not.toHaveBeenCalled();
    expect(f.focus.bookmark()).toBeUndefined();
  });
  it('rejected bound commands do not consume the deferred cursor', () => {
    const f = fixture();
    f.focus.restoreBrushCursor(f.editor, cursor());
    expect(() =>
      f.focus.command(() => {
        throw new Error('stale context');
      }, false),
    ).toThrow('stale context');
    expect(f.exeCommand).not.toHaveBeenCalled();
    expect(f.focus.bookmark()).toEqual(cursor());
  });
  it('a current owned restoration fulfils and clears the older deferred cursor', () => {
    const f = fixture();
    f.focus.restoreBrushCursor(f.editor, cursor(7));
    f.own();
    f.focus.restoreBrushCursor(f.editor, cursor(9));
    expect(f.exeCommand).toHaveBeenCalledExactlyOnceWith(cursor(9));
    expect(f.focus.bookmark()).toBeUndefined();
  });
});
